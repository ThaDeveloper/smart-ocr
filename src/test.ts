import { SmartOCR } from "./ocrProcessor";
import path from "path";

/** Testing the service. */
async function runTests() {
  const ocr = new SmartOCR();
  await ocr.init("eng");

  try {
    // Test image processing
    const imageText = await ocr.processImage(path.join(__dirname, "sample-image.png"));
    console.log("Image OCR Result:\n", imageText);

    // Test PDF with text
    const pdfText = await ocr.processPDF(path.join(__dirname, "sample-pdf.pdf"));
    console.log("PDF Text Extraction Result:\n", pdfText);

    // Test scanned PDF
    const scannedText = await ocr.processPDF(path.join(__dirname, "Degree.pdf"));
    console.log("Scanned PDF OCR Result:\n", scannedText);
  } finally {
    await ocr.terminate();
  }
}

runTests().catch(console.error);
