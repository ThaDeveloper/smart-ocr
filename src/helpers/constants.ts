import { PDFJSLibrary } from "../types/OCROptions";

let pdfjsLibraryTask: Promise<PDFJSLibrary> | null = null;

/**
 * Lazily loads the PDF.js Node build that ships as ESM in secure 4.x releases.
 * @returns Loaded PDF.js module.
 */
export async function loadPdfJsLibrary(): Promise<PDFJSLibrary> {
  pdfjsLibraryTask ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsLibraryTask;
}

export { pdfjsLibraryTask };
