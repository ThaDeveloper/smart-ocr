import { createWorker, Worker } from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist";
import sharp from "sharp";
import fs from "fs/promises";
import { TextItem } from "pdfjs-dist/types/src/display/api";
import path from 'path';
import os from 'os';

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
 * Processes scanned PDF pages through OCR
 * @param {string} pdfPath - Path to the PDF file
 * @returns {Promise<string>} Extracted text from all pages
 */
private async ocrPDFPages(pdfPath: string): Promise<string> {
  const pdfFile = path.resolve(pdfPath);

  await fs.access(pdfFile); // throws if missing

  const tempDir = path.join(os.tmpdir(), `pdf_images_${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    const { convertPDF } = await import('pdf2image');
    const images = await convertPDF(path.resolve(pdfPath), {
      density: 300,
      quality: 100,
      outputType: 'jpg',
    });

    let fullText = '';

    for (const { path: imagePath } of images) {
      try {
        const imageBuffer = await fs.readFile(imagePath); // ✅ read image file
        const processedImage = await sharp(imageBuffer)
          .resize(2000)
          .greyscale()
          .normalize()
          .sharpen()
          .toBuffer();
    
        const { data } = await this.worker.recognize(processedImage);
        fullText += data.text + '\n\n';
      } catch (error) {
        console.error(`Error processing page ${imagePath}:`, error);
        continue;
      } finally {
        try {
          await fs.unlink(imagePath); // ✅ cleanup
        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError);
        }
      }
    }
    
    return fullText;
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch (dirError) {
      console.error('Temp directory cleanup error:', dirError);
    }
  }
}


    /**
   * Terminates the OCR worker
   * @returns {Promise<void>} Promise that resolves when worker is terminated
   */
    public async terminate(): Promise<void> {
      await this.worker.terminate();
    }
  
}
