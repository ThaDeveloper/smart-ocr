import { createWorker, Worker } from 'tesseract.js';
import * as pdfjsLib from "pdfjs-dist";
import * as pdf2image from 'pdf2image';
import sharp from 'sharp';
import fs from 'fs/promises';

/**
 * SmartOCR class for processing images and PDFs with OCR capabilities.
 * It can handle both scanned and non-scanned PDFs, extracting text efficiently.
 */
class SmartOCR {
  private worker!: Worker;

  /**
   *
   */
  constructor() {
    this.init();
  }

  /**
   *
   * @param language
   */
  public async init(language: string | string [] = "eng"): Promise<void> {
    this.worker  = await createWorker(language);
    this.worker.load();
  }

  /**
   * Process OCR on an image file
   * @param imagePath Path to the image file
   * @returns Extracted text
   */
  public async processImage(imagePath: string): Promise<string> {
    const { data } = await this.worker.recognize(imagePath);
    return data.text;
  }

  /**
   * Process OCR on a PDF file (both scanned and non-scanned)
   * @param pdfPath Path to the PDF file
   * @returns Extracted text from all pages
   */
  public async processPDF(pdfPath: string): Promise<string> {
    // Check if PDF contains selectable text (non-scanned)
    try {
      const text = await this.extractPDFText(pdfPath);
      if (text.trim().length > 0) {
        return text;
      }
    } catch (error) {
      console.log('PDF text extraction failed, falling back to OCR');
    }

    // Fall back to OCR for scanned PDFs
    return this.ocrPDFPages(pdfPath);
  }

  /**
   *
   */
  public async terminate(): Promise<void> {
    await this.worker.terminate();
  }

  /**
   *
   * @param pdfPath
   */
  private async extractPDFText(pdfPath: string): Promise<string> {
      const pdfData = await fs.readFile(pdfPath);
      const loadingTask = pdfjsLib.getDocument({ data: pdfData });
      const pdf = await loadingTask.promise;
    
      let fullText = '';
    
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map((item: any) => item.str);
        fullText += strings.join(' ') + '\n';
      }
    
      return fullText;
    }

  /**
   *
   * @param pdfPath
   */
  private async ocrPDFPages(pdfPath: string): Promise<string> {
    const options = {
      density: 300,
      quality: 100,
      outputType: 'jpg' as const,
    };

    const convertedImages = await pdf2image.convertPDF(pdfPath, options);
    let fullText = '';

    for (const image of convertedImages) {
      try {
        // Optimize image for OCR
        const processedImage = await sharp(image.path)
          .resize(2000)
          .greyscale()
          .normalize()
          .sharpen()
          .toBuffer();

        const { data } = await this.worker.recognize(processedImage);
        fullText += data.text + '\n\n';
      } finally {
        // Clean up temporary image file
        try {
          await fs.unlink(image.path);
        } catch (cleanupError) {
          console.error('Error cleaning up temp file:', cleanupError);
        }
      }
    }

    return fullText;
  }
}


/**
 *
 */
interface ProcessResult {
  /**
   *
   */
  filePath: string;
  /**
   *
   */
  text: string;
  /**
   *
   */
  isPDF: boolean;
}

/**
 *
 */
async function main() {
  const ocr = new SmartOCR();
  await ocr.init();

  try {
    const filesToProcess = [
      { path: 'document.png', isPDF: false },
      { path: 'document.pdf', isPDF: true }
    ];

    const results: ProcessResult[] = [];
    
    for (const file of filesToProcess) {
      const text = file.isPDF 
        ? await ocr.processPDF(file.path)
        : await ocr.processImage(file.path);
      
      results.push({
        filePath: file.path,
        text,
        isPDF: file.isPDF
      });
    }

    console.log('OCR Results:', results);
  } finally {
    await ocr.terminate();
  }
}

main().catch(console.error);
