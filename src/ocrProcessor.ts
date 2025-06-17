import { createWorker, Worker } from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist";
import * as pdf2image from "pdf2image";
import sharp from "sharp";
import fs from "fs/promises";
import { TextItem } from "pdfjs-dist/types/src/display/api";

/**
 * SmartOCR class for processing images and PDFs with OCR capabilities.
 * It can handle both scanned and non-scanned PDFs, extracting text efficiently.
 */
class SmartOCR {
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
    await this.worker.load();
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
   * Terminates the OCR worker
   * @returns {Promise<void>} Promise that resolves when worker is terminated
   */
  public async terminate(): Promise<void> {
    await this.worker.terminate();
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
  // private async extractPDFText(pdfPath: string): Promise<string> {
  //   const pdfData = await fs.readFile(pdfPath);
  //   const loadingTask = pdfjsLib.getDocument({ data: pdfData });
  //   const pdf = await loadingTask.promise;

  //   let fullText = '';

  //   for (let i = 1; i <= pdf.numPages; i++) {
  //     const page = await pdf.getPage(i);
  //     const content = await page.getTextContent();
  //     const strings = content.items.map((item: { str: string }) => item.str);
  //     fullText += strings.join(' ') + '\n';
  //   }

  //   return fullText;
  // }

  /**
   * Processes scanned PDF pages through OCR
   * @param {string} pdfPath - Path to the PDF file
   * @returns {Promise<string>} Extracted text from all pages
   */
  private async ocrPDFPages(pdfPath: string): Promise<string> {
    const options = {
      density: 300,
      quality: 100,
      outputType: "jpg" as const,
    };

    const convertedImages = await pdf2image.convertPDF(pdfPath, options);
    let fullText = "";

    for (const image of convertedImages) {
      try {
        // Optimize image for OCR
        const processedImage = await sharp(image.path).resize(2000).greyscale().normalize().sharpen().toBuffer();

        const { data } = await this.worker.recognize(processedImage);
        fullText += data.text + "\n\n";
      } finally {
        // Clean up temporary image file
        try {
          await fs.unlink(image.path);
        } catch (cleanupError) {
          console.error("Error cleaning up temp file:", cleanupError);
        }
      }
    }

    return fullText;
  }
}

/**
 * Interface for OCR processing results
 */
interface ProcessResult {
  /** Path to the processed file */
  filePath: string;
  /** Extracted text content */
  text: string;
  /** Flag indicating if the file was a PDF */
  isPDF: boolean;
}

/**
 * Main function demonstrating OCR processing
 * @returns {Promise<void>} Promise that resolves when processing is complete
 */
async function main(): Promise<void> {
  const ocr = new SmartOCR();
  await ocr.init();

  try {
    const filesToProcess = [
      { path: "document.png", isPDF: false },
      { path: "document.pdf", isPDF: true },
    ];

    const results: ProcessResult[] = [];

    for (const file of filesToProcess) {
      const text = file.isPDF ? await ocr.processPDF(file.path) : await ocr.processImage(file.path);

      results.push({
        filePath: file.path,
        text,
        isPDF: file.isPDF,
      });
    }

    console.log("OCR Results:", results);
  } finally {
    await ocr.terminate();
  }
}

main().catch(console.error);
