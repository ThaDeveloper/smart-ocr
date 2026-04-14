#!/usr/bin/env node

"use strict";

const path = require("path");
const { SmartOCR } = require("../dist");

const sampleDirectory = path.resolve(__dirname, "..", "src");

async function runSample(ocr, label, fileName) {
  const filePath = path.join(sampleDirectory, fileName);
  const text = await ocr.processFile(filePath);
  console.log(`  - ${label}: Completed (${text.length} chars)`);
}

async function run(workerCount) {
  const ocr = new SmartOCR({ language: "eng", workerCount });
  
  await ocr.init();

  try {
    await runSample(ocr, "Image OCR", "sample-image.png");
    await runSample(ocr, "PDF Text Extraction", "sample-pdf.pdf");
    await runSample(ocr, "Scanned PDF OCR", "sample-scanned.pdf");
  } finally {
    await ocr.terminate();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
