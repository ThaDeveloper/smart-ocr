import { createWorker, Worker } from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";
import fs from "fs/promises";
import path from "path";
import type { PDFDocumentProxy, PDFPageProxy, TextItem } from "pdfjs-dist/types/src/display/api";
import { createCanvas } from "canvas";

type OCRWorkerOptions = Partial<NonNullable<Parameters<typeof createWorker>[2]>>;

const DEFAULT_LANGUAGE = "eng";
const DEFAULT_PDF_RENDER_SCALE = 2;
const SUPPORTED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp", ".gif"]);

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
  private readonly defaultLanguage: string | string[];
  private readonly pdfRenderScale: number;
  private readonly workerOptions?: OCRWorkerOptions;

  /**
   * Creates an OCR processor for images and PDFs.
   * @param {SmartOCROptions} [options] - Runtime options for the OCR worker and PDF rendering.
   */
  constructor(options: SmartOCROptions = {}) {
    this.defaultLanguage = options.language ?? DEFAULT_LANGUAGE;
    this.pdfRenderScale = options.pdfRenderScale ?? DEFAULT_PDF_RENDER_SCALE;
    this.workerOptions = options.workerOptions;
  }

  /**
   * Initializes the OCR worker with specified language(s)
   * @param {string|string[]} [language=this.defaultLanguage] - Language(s) to use for OCR processing
   * @returns {Promise<void>} Promise that resolves when initialization is complete
   */
  public async init(language: string | string[] = this.defaultLanguage): Promise<void> {
    await this.ensureInitialized(language);
  }

  /**
   * Processes a file by routing it to the appropriate OCR strategy.
   * @param {string} filePath - Path to a supported PDF or image file.
   * @returns {Promise<string>} Extracted text from the file.
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
      `Unsupported file type "${extension || "(none)"}". SmartOCR currently supports PDFs and common image formats.`,
    );
  }

  /**
   * Process OCR on an image file
   * @param {string} imagePath - Path to the image file
   * @returns {Promise<string>} Extracted text from the image
   */
  public async processImage(imagePath: string): Promise<string> {
    const worker = await this.ensureInitialized();
    return this.recognizeImage(worker, imagePath);
  }

  /**
   * Process OCR on a PDF file (both scanned and non-scanned)
   * @param {string} pdfPath - Path to the PDF file
   * @returns {Promise<string>} Extracted text from all pages
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
   * @returns {Promise<void>} Promise that resolves when worker shutdown completes.
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
   * @param {string} pdfPath - Path to the PDF file.
   * @returns {Promise<PDFDocumentProxy>} Loaded PDF document instance.
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
   * @param {PDFPageProxy} page - PDF page to process.
   * @returns {Promise<string>} Extracted text for the page.
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
   * @param {PDFPageProxy} page - PDF page containing selectable text.
   * @returns {Promise<string>} Extracted page text.
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
   * @param {string} text - Candidate extracted page text.
   * @returns {boolean} True when the page already contains usable text.
   */
  private hasUsableText(text: string): boolean {
    return text.replace(/\s+/g, "").length > 0;
  }

  /**
   * Renders a PDF page to an image and runs OCR on the result.
   * @param {PDFPageProxy} page - PDF page to OCR.
   * @param {Worker} worker - Initialized Tesseract worker.
   * @returns {Promise<string>} OCR text for the page.
   */
  private async ocrPage(page: PDFPageProxy, worker: Worker): Promise<string> {
    const viewport = page.getViewport({ scale: this.pdfRenderScale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    return this.recognizeImage(worker, canvas.toBuffer("image/png"));
  }

  /**
   * Runs OCR on a raster image or buffer.
   * @param {Worker} worker - Initialized Tesseract worker.
   * @param {string|Buffer} image - Image path or in-memory image buffer.
   * @returns {Promise<string>} OCR text from the image.
   */
  private async recognizeImage(worker: Worker, image: string | Buffer): Promise<string> {
    const {
      data: { text },
    } = await worker.recognize(image);

    return text;
  }

  /**
   * Ensures that exactly one worker is initialized for the requested language.
   * @param {string|string[]} [language=this.defaultLanguage] - Language(s) to initialize.
   * @returns {Promise<Worker>} Ready-to-use Tesseract worker.
   */
  private async ensureInitialized(language: string | string[] = this.defaultLanguage): Promise<Worker> {
    const normalizedLanguage = SmartOCR.normalizeLanguage(language);

    await this.runWorkerTask(async () => {
      if (this.worker && this.workerLanguageKey === normalizedLanguage) {
        return;
      }

      if (this.worker) {
        await this.worker.terminate();
        this.worker = null;
        this.workerLanguageKey = null;
      }

      this.worker = await createWorker(language, 1, this.workerOptions);
      this.workerLanguageKey = normalizedLanguage;
    });

    if (!this.worker) {
      throw new Error("OCR worker failed to initialize.");
    }

    return this.worker;
  }

  /**
   * Serializes worker lifecycle operations so initialization and shutdown cannot race.
   * @param {() => Promise<void>} action - Worker lifecycle action to run.
   * @returns {Promise<void>} Promise that resolves when the action completes.
   */
  private async runWorkerTask(action: () => Promise<void>): Promise<void> {
    const nextTask = this.workerTask.catch(() => undefined).then(action);
    this.workerTask = nextTask.then(() => undefined, () => undefined);
    await nextTask;
  }

  /**
   * Normalizes the language argument for worker reuse checks.
   * @param {string|string[]} language - OCR language or language list.
   * @returns {string} Stable cache key for the requested language.
   */
  private static normalizeLanguage(language: string | string[]): string {
    return (Array.isArray(language) ? [...language] : [language]).join("+");
  }
}
