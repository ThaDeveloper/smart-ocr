import { createWorker, Worker } from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist";
import fs from "fs/promises";
import { TextItem } from "pdfjs-dist/types/src/display/api";
import { createCanvas } from "canvas";

/**
 * SmartOCR class for processing images and PDFs with OCR capabilities.
 * It can handle both scanned and non-scanned PDFs, extracting text efficiently.
 */
export class SmartOCR {
  private worker!: Worker;

  /**  */
  constructor() {
    this.init();
  }

  /**
   * Initializes the OCR worker with specified language(s)
   * @param {string|string[]} [language="eng"] - Language(s) to use for OCR processing
   * @returns {Promise<void>} Promise that resolves when initialization is complete
   */
  public async init(language: string | string[] = "eng"): Promise<void> {
    this.worker = await createWorker(language);
  }

  /**
   * Process OCR on an image file
   * @param {string} imagePath - Path to the image file
   * @returns {Promise<string>} Extracted text from the image
   */
  public async processImage(imagePath: string): Promise<string> {
    const { data } = await this.worker.recognize(imagePath);
    return data.text;
  }

  /**
   * Process OCR on a PDF file (both scanned and non-scanned)
   * @param {string} pdfPath - Path to the PDF file
   * @returns {Promise<string>} Extracted text from all pages
   */
  public async processPDF(pdfPath: string): Promise<string> {
    // Check if PDF contains selectable text (non-scanned)
    try {
      const text = await this.extractPDFText(pdfPath);
      if (text.trim().length > 0) {
        return text;
      }
    } catch (error) {
      console.log("PDF text extraction failed, falling back to OCR", error);
    }

    // Fall back to OCR for scanned PDFs
    return this.ocrPDFPages(pdfPath);
  }

  /**
   * Extracts text directly from a PDF (non-scanned documents)
   * @param {string} pdfPath - Path to the PDF file
   * @returns {Promise<string>} Extracted text from the PDF
   */
  private async extractPDFText(pdfPath: string): Promise<string> {
    const pdfData = await fs.readFile(pdfPath);
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    const pdf = await loadingTask.promise;

    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.filter((item): item is TextItem => "str" in item).map((item) => item.str);
      fullText += strings.join(" ") + "\n";
    }

    return fullText;
  }

  /**
   * Processes a scanned PDF by rendering each page to an image and running OCR
   * Uses pdfjs-dist to open the PDF.
   * Renders each page into a canvas.
   * Exports PNG images (via canvas).
   * Runs Tesseract OCR on the PNGs.
   * @param pdfPath The path to the PDF file.
   * @returns The extracted text from all pages.
   */
  private async ocrPDFPages(pdfPath: string): Promise<string> {
    const pdfData = await fs.readFile(pdfPath);

    // Load PDF
    const loadingTask = pdfjsLib.getDocument({
      data: pdfData,
      verbosity: pdfjsLib.VerbosityLevel.ERRORS,
    });

    const pdfDocument = await loadingTask.promise;
    let fullText = "";

    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 }); // adjust for higher DPI

      // Create canvas
      const canvas = createCanvas(viewport.width, viewport.height);
      const context = canvas.getContext("2d");

      const renderContext = {
        canvasContext: context,
        viewport,
      };

      // Render PDF page to canvas
      await page.render(renderContext).promise;

      // Convert canvas to PNG buffer
      const pngBuffer = canvas.toBuffer("image/png");

      // Feed buffer to Tesseract
      const {
        data: { text },
      } = await this.worker.recognize(pngBuffer);

      console.log(`Page ${pageNum} text:`, text);
      fullText += text + "\n\n";
    }

    return fullText;
  }

  /**
   * Terminates the OCR worker
   * @returns {Promise<void>} Promise that resolves when worker is terminated
   */
  public async terminate(): Promise<void> {
    await this.worker.terminate();
  }
}
