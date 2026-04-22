#!/usr/bin/env node

"use strict";

const path = require("path");
const { SmartOCR } = require("../dist");
const process = require("node:process");

const sampleDirectory = path.resolve(__dirname, "..", "src");

async function runSample(ocr, label, fileName) {
  const filePath = path.join(sampleDirectory, fileName);
  const text = await ocr.processFile(filePath);
  console.log(`  - ${label}: Completed (${JSON.stringify(text).length} chars)`);
}

async function run(workerCount) {
  process.loadEnvFile(".env");

  // structuredOutputOptions is entirely optional. If not provided, SmartOCR will simply return the raw text without any AI processing.
  // const ocr = new SmartOCR({
  //   language: "eng",
  //   workerCount,
  //   structuredOutputOptions: {
  //     ai: {
  //       provider: "openai",
  //       apiKey: process.env.OPEN_AI_API_KEY1,
  //       model: "gpt-4.1",
  //       prompt: "Extract the text content from the document and return it in a JSON object using the schema provided.",
  //     },
  //     schema: {
  //       type: "object",
  //       properties: {
  //         sampleDate: { type: "string", format: "date" },
  //         preparedBy: { type: "string" },
  //         createdAndTestedUsing: { type: "string" },
  //       },
  //       required: ["text", "sampleDate", "preparedBy", "createdAndTestedUsing"],
  //       additionalProperties: false,
  //     },
  //   },
  // });
  const ocr = new SmartOCR({ language: "eng", workerCount });

  await ocr.init();

  try {
    await runSample(ocr, "Image OCR", "sample-image.png");
    // await runSample(ocr, "PDF Text Extraction", "sample-pdf.pdf");
    // await runSample(ocr, "Scanned PDF OCR", "sample-scanned.pdf");
  } finally {
    await ocr.terminate();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
