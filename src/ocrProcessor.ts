import { createWorker, PSM, Worker } from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";
import fs from "fs/promises";
import path from "path";
import type { PDFDocumentProxy, PDFPageProxy, TextItem } from "pdfjs-dist/types/src/display/api";
import { createCanvas } from "canvas";

type OCRWorkerOptions = Partial<NonNullable<Parameters<typeof createWorker>[2]>>;
type RasterCanvas = ReturnType<typeof createCanvas>;
type ContentBounds = { minX: number; minY: number; maxX: number; maxY: number };

const DEFAULT_LANGUAGE = "eng";
const DEFAULT_PDF_RENDER_SCALE = 2;
const SUPPORTED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp", ".gif"]);
const CONTENT_BLOCK_SIZE = 16;
const CONTENT_PIXEL_LUMINANCE_THRESHOLD = 235;
const CONTENT_BLOCK_DARK_PIXEL_RATIO = 0.03;
const CONTENT_PADDING = 32;
const MIN_COMPONENT_BLOCK_COUNT = 6;
const MAX_SKIP_CROP_RATIO = 0.98;
const MIN_OCR_CANVAS_WIDTH = 1200;
const MIN_OCR_CANVAS_HEIGHT = 800;
const MAX_OCR_UPSCALE_FACTOR = 2;

/**
 * Runtime options for configuring OCR behavior.
 */
export interface SmartOCROptions {
  language?: string | string[];
  pdfRenderScale?: number;
  workerOptions?: OCRWorkerOptions;
}

/**
 * SmartOCR class for processing images and PDFs with OCR capabilities.
 * It can handle both scanned and non-scanned PDFs, extracting text efficiently.
 */
export class SmartOCR {
  private worker: Worker | null = null;
  private workerLanguageKey: string | null = null;
  private workerTask: Promise<void> = Promise.resolve();
  private activeLanguage: string | string[];
  private readonly pdfRenderScale: number;
  private readonly workerOptions?: OCRWorkerOptions;

  /**
   * Creates an OCR processor for images and PDFs.
   * @param options Runtime options for the OCR worker and PDF rendering.
   */
  constructor(options: SmartOCROptions = {}) {
    this.activeLanguage = SmartOCR.cloneLanguage(options.language ?? DEFAULT_LANGUAGE);
    this.pdfRenderScale = options.pdfRenderScale ?? DEFAULT_PDF_RENDER_SCALE;
    this.workerOptions = options.workerOptions;
  }

  /**
   * Initializes the OCR worker with specified language(s)
   * @param language Language(s) to use for OCR processing
   * @returns Promise that resolves when initialization is complete
   */
  public async init(language: string | string[] = this.activeLanguage): Promise<void> {
    const nextLanguage = SmartOCR.cloneLanguage(language);
    await this.ensureInitialized(nextLanguage);
    this.activeLanguage = nextLanguage;
  }

  /**
   * Processes a file by routing it to the appropriate OCR strategy.
   * @param filePath Path to a supported PDF or image file.
   * @returns Extracted text from the file.
   */
  public async processFile(filePath: string): Promise<string> {
    const extension = path.extname(filePath).toLowerCase();

    if (extension === ".pdf") {
      return this.processPDF(filePath);
    }

    if (SUPPORTED_IMAGE_EXTENSIONS.has(extension)) {
      return this.processImage(filePath);
    }

    throw new Error(
      `Unsupported file type "${extension || "(none)"}". SmartOCR currently supports PDFs and common image formats.`
    );
  }

  /**
   * Process OCR on an image file
   * @param imagePath Path to the image file
   * @returns Extracted text from the image
   */
  public async processImage(imagePath: string): Promise<string> {
    const worker = await this.ensureInitialized();
    return this.recognizeImage(worker, imagePath);
  }

  /**
   * Process OCR on a PDF file (both scanned and non-scanned)
   * @param pdfPath Path to the PDF file
   * @returns Extracted text from all pages
   */
  public async processPDF(pdfPath: string): Promise<string> {
    const pdfDocument = await this.loadPDFDocument(pdfPath);

    try {
      const pageTexts: string[] = [];

      for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
        const page = await pdfDocument.getPage(pageNumber);

        try {
          const extractedText = await this.extractPageTextWithFallback(page);
          pageTexts.push(extractedText);
        } finally {
          page.cleanup();
        }
      }

      return pageTexts.join("\n\n").trim();
    } finally {
      await pdfDocument.cleanup();
      await pdfDocument.destroy();
    }
  }

  /**
   * Terminates the OCR worker
   * @returns Promise that resolves when worker shutdown completes.
   */
  public async terminate(): Promise<void> {
    await this.runWorkerTask(async () => {
      if (!this.worker) {
        return;
      }

      const workerToTerminate = this.worker;
      this.worker = null;
      this.workerLanguageKey = null;
      await workerToTerminate.terminate();
    });
  }

  /**
   * Loads a PDF document for text extraction or OCR.
   * @param pdfPath Path to the PDF file.
   * @returns Loaded PDF document instance.
   */
  private async loadPDFDocument(pdfPath: string): Promise<PDFDocumentProxy> {
    const pdfData = await fs.readFile(pdfPath);
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfData),
      verbosity: pdfjsLib.VerbosityLevel.ERRORS,
      useWorkerFetch: false,
      isEvalSupported: false,
    });

    return loadingTask.promise;
  }

  /**
   * Extracts text from a single page and falls back to OCR when needed.
   * @param page PDF page to process.
   * @returns Extracted text for the page.
   */
  private async extractPageTextWithFallback(page: PDFPageProxy): Promise<string> {
    try {
      const extractedText = await this.extractPageText(page);
      if (this.hasUsableText(extractedText)) {
        return extractedText;
      }
    } catch {
      // Fall through to OCR when direct text extraction fails for a page.
    }

    const worker = await this.ensureInitialized();
    return this.ocrPage(page, worker);
  }

  /**
   * Extracts searchable text from a single PDF page.
   * @param page PDF page containing selectable text.
   * @returns Extracted page text.
   */
  private async extractPageText(page: PDFPageProxy): Promise<string> {
    const content = await page.getTextContent();
    const strings = content.items
      .filter((item): item is TextItem => "str" in item)
      .map((item) => item.str.trim())
      .filter(Boolean);

    return strings.join(" ");
  }

  /**
   * Determines whether extracted text is meaningful enough to skip OCR.
   * @param text Candidate extracted page text.
   * @returns True when the page already contains usable text.
   */
  private hasUsableText(text: string): boolean {
    return text.replace(/\s+/g, "").length > 0;
  }

  /**
   * Renders a PDF page to an image and runs OCR on the result.
   * @param page PDF page to OCR.
   * @param worker Initialized Tesseract worker.
   * @returns OCR text for the page.
   */
  private async ocrPage(page: PDFPageProxy, worker: Worker): Promise<string> {
    const viewport = page.getViewport({ scale: this.pdfRenderScale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    const preparedCanvas = this.prepareCanvasForOCR(canvas);
    return this.recognizeImage(worker, preparedCanvas.toBuffer("image/png"));
  }

  /**
   * Runs OCR on a raster image or buffer.
   * @param worker Initialized Tesseract worker.
   * @param image Image path or in-memory image buffer.
   * @returns OCR text from the image.
   */
  private async recognizeImage(worker: Worker, image: string | Buffer): Promise<string> {
    const {
      data: { text },
    } = await worker.recognize(image);

    return text;
  }

  /**
   * Ensures that exactly one worker is initialized for the requested language.
   * @param language Language(s) to initialize.
   * @returns Ready-to-use Tesseract worker.
   */
  private async ensureInitialized(language: string | string[] = this.activeLanguage): Promise<Worker> {
    const requestedLanguage = SmartOCR.cloneLanguage(language);
    const normalizedLanguage = SmartOCR.normalizeLanguage(requestedLanguage);

    await this.runWorkerTask(async () => {
      if (this.worker && this.workerLanguageKey === normalizedLanguage) {
        return;
      }

      if (this.worker) {
        await this.worker.terminate();
        this.worker = null;
        this.workerLanguageKey = null;
      }

      this.worker = await createWorker(requestedLanguage, 1, this.workerOptions);
      await this.worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      });
      this.workerLanguageKey = normalizedLanguage;
    });

    if (!this.worker) {
      throw new Error("OCR worker failed to initialize.");
    }

    return this.worker;
  }

  /**
   * Serializes worker lifecycle operations so initialization and shutdown cannot race.
   * @param action Worker lifecycle action to run.
   * @returns Promise that resolves when the action completes.
   */
  private async runWorkerTask(action: () => Promise<void>): Promise<void> {
    const nextTask = this.workerTask.catch(() => undefined).then(action);
    this.workerTask = nextTask.then(
      () => undefined,
      () => undefined
    );
    await nextTask;
  }

  /**
   * Normalizes the language argument for worker reuse checks.
   * @param language OCR language or language list.
   * @returns Stable cache key for the requested language.
   */
  private static normalizeLanguage(language: string | string[]): string {
    return (Array.isArray(language) ? [...language] : [language]).join("+");
  }

  /**
   * Clones language input so the active OCR language is not affected by external mutation.
   * @param language OCR language or language list.
   * @returns Copy of the supplied language configuration.
   */
  private static cloneLanguage(language: string | string[]): string | string[] {
    return Array.isArray(language) ? [...language] : language;
  }

  /**
   * Crops large blank margins so OCR focuses on the primary content area.
   * @param canvas Rendered page image.
   * @returns Original canvas or a cropped version when useful.
   */
  private prepareCanvasForOCR(canvas: RasterCanvas): RasterCanvas {
    const bounds = this.findContentBounds(canvas);
    const contentCanvas = bounds ? this.cropCanvas(canvas, bounds) : canvas;
    return this.upscaleCanvasForOCR(contentCanvas);
  }

  /**
   * Locates the union of meaningful content regions inside a rendered page.
   * @param canvas Rendered page image.
   * @returns Bounding box of page content, or null when no better crop is found.
   */
  private findContentBounds(canvas: RasterCanvas): ContentBounds | null {
    const context = canvas.getContext("2d");
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const columns = Math.ceil(canvas.width / CONTENT_BLOCK_SIZE);
    const rows = Math.ceil(canvas.height / CONTENT_BLOCK_SIZE);
    const activeBlocks = Array.from({ length: rows }, () => Array(columns).fill(false));

    for (let blockY = 0; blockY < rows; blockY++) {
      for (let blockX = 0; blockX < columns; blockX++) {
        let darkPixels = 0;
        let totalPixels = 0;

        for (let y = blockY * CONTENT_BLOCK_SIZE; y < Math.min(canvas.height, (blockY + 1) * CONTENT_BLOCK_SIZE); y++) {
          for (
            let x = blockX * CONTENT_BLOCK_SIZE;
            x < Math.min(canvas.width, (blockX + 1) * CONTENT_BLOCK_SIZE);
            x++
          ) {
            const offset = (y * canvas.width + x) * 4;
            const red = data[offset];
            const green = data[offset + 1];
            const blue = data[offset + 2];
            const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

            if (luminance < CONTENT_PIXEL_LUMINANCE_THRESHOLD) {
              darkPixels += 1;
            }

            totalPixels += 1;
          }
        }

        activeBlocks[blockY][blockX] = darkPixels / totalPixels > CONTENT_BLOCK_DARK_PIXEL_RATIO;
      }
    }

    const meaningfulComponents = this.findMeaningfulComponents(activeBlocks, columns, rows);
    if (meaningfulComponents.length === 0) {
      return null;
    }

    const blockBounds = meaningfulComponents.reduce<ContentBounds>(
      (bounds, component) => ({
        minX: Math.min(bounds.minX, component.minX),
        minY: Math.min(bounds.minY, component.minY),
        maxX: Math.max(bounds.maxX, component.maxX),
        maxY: Math.max(bounds.maxY, component.maxY),
      }),
      { minX: columns, minY: rows, maxX: -1, maxY: -1 }
    );

    const pixelBounds = {
      minX: Math.max(0, blockBounds.minX * CONTENT_BLOCK_SIZE - CONTENT_PADDING),
      minY: Math.max(0, blockBounds.minY * CONTENT_BLOCK_SIZE - CONTENT_PADDING),
      maxX: Math.min(canvas.width - 1, (blockBounds.maxX + 1) * CONTENT_BLOCK_SIZE - 1 + CONTENT_PADDING),
      maxY: Math.min(canvas.height - 1, (blockBounds.maxY + 1) * CONTENT_BLOCK_SIZE - 1 + CONTENT_PADDING),
    };

    const croppedArea = (pixelBounds.maxX - pixelBounds.minX + 1) * (pixelBounds.maxY - pixelBounds.minY + 1);
    const fullArea = canvas.width * canvas.height;

    return croppedArea / fullArea >= MAX_SKIP_CROP_RATIO ? null : pixelBounds;
  }

  /**
   * Finds non-noise connected regions in the active block grid.
   * @param activeBlocks Coarse content grid derived from luminance.
   * @param columns Number of block columns.
   * @param rows Number of block rows.
   * @returns Connected components worth keeping.
   */
  private findMeaningfulComponents(
    activeBlocks: boolean[][],
    columns: number,
    rows: number
  ): Array<ContentBounds & { width: number; height: number; count: number }> {
    const visited = Array.from({ length: rows }, () => Array(columns).fill(false));
    const components: Array<ContentBounds & { width: number; height: number; count: number }> = [];
    const offsets = [-1, 0, 1];

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        if (!activeBlocks[row][column] || visited[row][column]) {
          continue;
        }

        const queue: Array<[number, number]> = [[column, row]];
        visited[row][column] = true;
        let minX = column;
        let minY = row;
        let maxX = column;
        let maxY = row;
        let count = 0;

        while (queue.length > 0) {
          const [currentX, currentY] = queue.shift()!;
          count += 1;
          minX = Math.min(minX, currentX);
          minY = Math.min(minY, currentY);
          maxX = Math.max(maxX, currentX);
          maxY = Math.max(maxY, currentY);

          for (const offsetY of offsets) {
            for (const offsetX of offsets) {
              if (offsetX === 0 && offsetY === 0) {
                continue;
              }

              const nextX = currentX + offsetX;
              const nextY = currentY + offsetY;

              if (nextX < 0 || nextY < 0 || nextX >= columns || nextY >= rows) {
                continue;
              }

              if (!activeBlocks[nextY][nextX] || visited[nextY][nextX]) {
                continue;
              }

              visited[nextY][nextX] = true;
              queue.push([nextX, nextY]);
            }
          }
        }

        const component = {
          minX,
          minY,
          maxX,
          maxY,
          count,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
        };

        if (this.isMeaningfulComponent(component, columns, rows)) {
          components.push(component);
        }
      }
    }

    return components;
  }

  /**
   * Filters out scanner edges and isolated specks that should not drive cropping.
   * @param component Candidate component.
   * @param columns Number of block columns.
   * @param rows Number of block rows.
   * @returns True when the component likely represents actual document content.
   */
  private isMeaningfulComponent(
    component: ContentBounds & { width: number; height: number; count: number },
    columns: number,
    rows: number
  ): boolean {
    if (component.count < MIN_COMPONENT_BLOCK_COUNT) {
      return false;
    }

    const touchesEdge =
      component.minX === 0 || component.minY === 0 || component.maxX === columns - 1 || component.maxY === rows - 1;
    const shortSide = Math.min(component.width, component.height);

    return !(touchesEdge && shortSide <= 2);
  }

  /**
   * Copies the selected content bounds into a new canvas.
   * @param canvas Source page canvas.
   * @param bounds Pixel bounds to keep.
   * @returns Cropped canvas.
   */
  private cropCanvas(canvas: RasterCanvas, bounds: ContentBounds): RasterCanvas {
    const width = bounds.maxX - bounds.minX + 1;
    const height = bounds.maxY - bounds.minY + 1;
    const croppedCanvas = createCanvas(width, height);
    const croppedContext = croppedCanvas.getContext("2d");

    croppedContext.drawImage(canvas, bounds.minX, bounds.minY, width, height, 0, 0, width, height);

    return croppedCanvas;
  }

  /**
   * Enlarges small content regions so OCR has more usable detail.
   * @param canvas Cropped page canvas.
   * @returns Original canvas or an upscaled version when the content is small.
   */
  private upscaleCanvasForOCR(canvas: RasterCanvas): RasterCanvas {
    const scaleFactor = Math.min(
      MAX_OCR_UPSCALE_FACTOR,
      Math.max(MIN_OCR_CANVAS_WIDTH / canvas.width, MIN_OCR_CANVAS_HEIGHT / canvas.height, 1)
    );

    if (scaleFactor <= 1) {
      return canvas;
    }

    const upscaledCanvas = createCanvas(Math.ceil(canvas.width * scaleFactor), Math.ceil(canvas.height * scaleFactor));
    const upscaledContext = upscaledCanvas.getContext("2d");
    upscaledContext.imageSmoothingEnabled = true;
    upscaledContext.drawImage(canvas, 0, 0, upscaledCanvas.width, upscaledCanvas.height);

    return upscaledCanvas;
  }
}
