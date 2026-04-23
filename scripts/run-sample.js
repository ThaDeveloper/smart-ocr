#!/usr/bin/env node

"use strict";

const path = require("path");
const { SmartOCR } = require("../dist");
// const process = require("node:process");

const sampleDirectory = path.resolve(__dirname, "..", "src");

async function runSample(ocr, label, fileName) {
  const filePath = path.join(sampleDirectory, fileName);
  const text = await ocr.processFile(filePath);
  console.log(`  - ${label}: Completed (${JSON.stringify(text).length} chars)`);
}

async function run(workerCount) {
  // process.loadEnvFile(".env");

  // const openAiApiKey = process.env.OPENAI_API_KEY;

  // structuredOutputOptions is optional. If not provided, SmartOCR returns raw text.
  // const ocr = new SmartOCR(
  //   openAiApiKey
  //     ? {
  //         language: "eng",
  //         workerCount,
  //         structuredOutputOptions: {
  //           ai: {
  //             provider: "openai",
  //             apiKey: openAiApiKey,
  //             model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  //             prompt: "Extract the fields. Use null when a value is missing or unclear.",
  //           },
  //           schema: {
  //             type: "object",
  //             properties: {
  //               text: { type: "string" },
  //               sampleDate: { type: ["string", "null"], format: "date" },
  //               preparedBy: { type: ["string", "null"] },
  //               createdAndTestedUsing: { type: ["string", "null"] },
  //             },
  //             required: ["text", "sampleDate", "preparedBy", "createdAndTestedUsing"],
  //             additionalProperties: false,
  //           },
  //         },
  //       }
  //     : { language: "eng", workerCount }
  // );

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
