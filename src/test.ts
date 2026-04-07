import { SmartOCR } from "./ocrProcessor";
import path from "path";

const sampleDirectory = path.resolve(__dirname, "..", "src");

/**
 * Runs OCR against one of the bundled sample files.
 * @param {SmartOCR} ocr - OCR processor instance.
 * @param {string} label - Label printed before the OCR result.
 * @param {string} fileName - Sample file name inside the src directory.
 * @returns {Promise<void>} Promise that resolves when the sample has been processed.
 */
async function runSample(ocr: SmartOCR, label: string, fileName: string): Promise<void> {
  const filePath = path.join(sampleDirectory, fileName);
  const text = await ocr.processFile(filePath);
  console.log(`${label}:\n`, text);
}

/** Testing the service. */
async function runTests() {
  const ocr = new SmartOCR({ language: "eng" });

  try {
    // await runSample(ocr, "Image OCR Result", "sample-image.png");
    // await runSample(ocr, "PDF Text Extraction Result", "sample-pdf.pdf");
    await runSample(ocr, "Scanned PDF OCR Result", "id.pdf");
    //  await runSample(ocr, "Scanned PDF OCR Result", "Degree.pdf");
  } finally {
    await ocr.terminate();
  }
}

runTests().catch(console.error);
