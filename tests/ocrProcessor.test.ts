import assert from "assert";
import { createCanvas } from "canvas";
import { SmartOCR } from "../src/ocrProcessor";

type TestCase = {
  name: string;
  run: () => Promise<void> | void;
};

type OCRInternals = {
  loadPDFDocument: (pdfPath: string) => Promise<{
    numPages: number;
    getPage: (pageNumber: number) => Promise<{ cleanup: () => void; result: string }>;
    cleanup: () => Promise<void>;
    destroy: () => Promise<void>;
  }>;
  extractPageTextWithFallback: (page: { cleanup: () => void; result: string }) => Promise<string>;
  extractPageText: (page: unknown) => Promise<string>;
  ensureInitialized: () => Promise<unknown>;
  ocrPage: (page: unknown, worker: unknown) => Promise<string>;
  prepareCanvasForOCR: (canvas: ReturnType<typeof createCanvas>) => ReturnType<typeof createCanvas>;
};

const tests: TestCase[] = [];

/**
 * Registers a test case in the local test runner.
 * @param {string} name - Human-readable test name.
 * @param {() => Promise<void> | void} run - Test implementation.
 * @returns {void} Nothing.
 */
function test(name: string, run: () => Promise<void> | void): void {
  tests.push({ name, run });
}

/**
 * Casts the OCR instance to a shape that exposes internal helpers for unit tests.
 * @param {SmartOCR} ocr - OCR instance under test.
 * @returns {OCRInternals} OCR instance with internal methods exposed to the test harness.
 */
function asInternals(ocr: SmartOCR): OCRInternals {
  return ocr as unknown as OCRInternals;
}

test("processFile routes PDFs to processPDF", async () => {
  const ocr = new SmartOCR();
  const calls: string[] = [];
  (ocr as SmartOCR & { processPDF: (filePath: string) => Promise<string> }).processPDF = async (filePath: string) => {
    calls.push(filePath);
    return "pdf-result";
  };

  const result = await ocr.processFile("/tmp/sample.PDF");

  assert.strictEqual(result, "pdf-result");
  assert.deepStrictEqual(calls, ["/tmp/sample.PDF"]);
});

test("processFile routes image extensions to processImage", async () => {
  const ocr = new SmartOCR();
  const calls: string[] = [];
  (ocr as SmartOCR & { processImage: (filePath: string) => Promise<string> }).processImage = async (filePath: string) => {
    calls.push(filePath);
    return "image-result";
  };

  const result = await ocr.processFile("/tmp/card.JPEG");

  assert.strictEqual(result, "image-result");
  assert.deepStrictEqual(calls, ["/tmp/card.JPEG"]);
});

test("processFile rejects unsupported file types", async () => {
  const ocr = new SmartOCR();

  await assert.rejects(
    async () => ocr.processFile("/tmp/archive.zip"),
    /Unsupported file type ".zip"/,
  );
});

test("processPDF combines page results and cleans up pages and document", async () => {
  const ocr = new SmartOCR();
  const internals = asInternals(ocr);
  const cleanedPages = [0, 0, 0];
  let documentCleanupCount = 0;
  let documentDestroyCount = 0;
  const pages = cleanedPages.map((_, index) => ({
    result: `Page ${index + 1}`,
    cleanup: () => {
      cleanedPages[index] += 1;
    },
  }));

  internals.loadPDFDocument = async () => ({
    numPages: pages.length,
    getPage: async (pageNumber: number) => pages[pageNumber - 1],
    cleanup: async () => {
      documentCleanupCount += 1;
    },
    destroy: async () => {
      documentDestroyCount += 1;
    },
  });

  internals.extractPageTextWithFallback = async (page: { cleanup: () => void; result: string }) => page.result;

  const result = await ocr.processPDF("/tmp/fake.pdf");

  assert.strictEqual(result, "Page 1\n\nPage 2\n\nPage 3");
  assert.deepStrictEqual(cleanedPages, [1, 1, 1]);
  assert.strictEqual(documentCleanupCount, 1);
  assert.strictEqual(documentDestroyCount, 1);
});

test("extractPageTextWithFallback uses OCR when extracted text is blank", async () => {
  const ocr = new SmartOCR();
  const internals = asInternals(ocr);
  let ensureInitializedCalls = 0;
  let ocrCalls = 0;

  internals.extractPageText = async () => "   ";
  internals.ensureInitialized = async () => {
    ensureInitializedCalls += 1;
    return { worker: true };
  };
  internals.ocrPage = async () => {
    ocrCalls += 1;
    return "ocr-fallback";
  };

  const result = await internals.extractPageTextWithFallback({} as { cleanup: () => void; result: string });

  assert.strictEqual(result, "ocr-fallback");
  assert.strictEqual(ensureInitializedCalls, 1);
  assert.strictEqual(ocrCalls, 1);
});

test("prepareCanvasForOCR crops sparse content and upscales small regions", () => {
  const ocr = new SmartOCR();
  const internals = asInternals(ocr);
  const canvas = createCanvas(2400, 2400);
  const context = canvas.getContext("2d");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#000000";
  context.fillRect(900, 300, 640, 480);

  const preparedCanvas = internals.prepareCanvasForOCR(canvas);

  assert.ok(preparedCanvas.width < canvas.width);
  assert.ok(preparedCanvas.height < canvas.height);
  assert.ok(preparedCanvas.width >= 1200);
  assert.ok(preparedCanvas.height >= 800);
});

/**
 * Runs the local test suite and exits non-zero when any test fails.
 * @returns {Promise<void>} Promise that resolves when the suite finishes.
 */
async function run(): Promise<void> {
  let failures = 0;

  for (const { name, run: runTest } of tests) {
    try {
      await runTest();
      console.log(`PASS ${name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${name}`);
      console.error(error);
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
    throw new Error(`${failures} test(s) failed.`);
  }

  console.log(`Passed ${tests.length} test(s).`);
}

run().catch((error) => {
  console.error(error);
});
