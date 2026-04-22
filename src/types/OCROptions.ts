import { createWorker } from "tesseract.js";
import type { getDocument as getPDFDocument } from "pdfjs-dist/types/src/display/api";
import { StructuredOutputOptions } from "./StructuredOutputOptions";

/**
 * A type representing the options that can be passed to the Tesseract.js worker when performing OCR. This includes any relevant configuration settings for the OCR process, such as language, tessedit_char_whitelist, and any other options supported by Tesseract.js.
 */
export type OCRWorkerOptions = Partial<NonNullable<Parameters<typeof createWorker>[2]>>;

/**
 * A type representing the bounding box of content detected on a page, defined by its minimum and maximum X and Y coordinates. This can be used to determine the area of the page that contains text or other relevant content for OCR processing.
 */
export type ContentBounds = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * A type representing the PDF.js library, including the getDocument function and any relevant constants or types.
 */
export type PDFJSLibrary = {
  getDocument: typeof getPDFDocument;
  VerbosityLevel: {
    ERRORS: number;
  };
};

/**
 * Runtime options for configuring OCR behavior.
 */
export interface SmartOCROptions {
  language?: string | string[];
  pdfRenderScale?: number;
  workerOptions?: OCRWorkerOptions;
  workerCount?: number;
  structuredOutputOptions?: StructuredOutputOptions;
}
