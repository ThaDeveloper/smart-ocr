import assert from "assert";
import { SmartOCR } from "../src/ocrProcessor";
import type { RasterCanvas } from "../src/PDFJSNodeCanvasFactory";
import { createRasterCanvas } from "../src/napiCanvas";
import { asInternals, asLLMStatic, stubHttpsResponse } from "./helpers";

type TestCase = {
  name: string;
  run: () => Promise<void> | void;
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

test("init updates the active language used by future OCR calls", async () => {
  const ocr = new SmartOCR();
  const internals = asInternals(ocr);
  const requestedLanguages: Array<string | string[] | undefined> = [];

  internals.ensureInitialized = async (language?: string | string[]) => {
    requestedLanguages.push(language);
    return {};
  };

  await ocr.init("spa");

  assert.deepStrictEqual(requestedLanguages, ["spa"]);
  assert.strictEqual(internals.activeLanguage, "spa");
});

test("ensureInitialized reuses the scheduler for the current active language", async () => {
  const ocr = new SmartOCR();
  const internals = asInternals(ocr);
  const scheduler = {
    terminate: async () => {
      throw new Error("scheduler should not be replaced");
    },
    addJob: async () => {
      throw new Error("scheduler should be reused, not invoked for initialization");
    },
    addWorker: () => {
      throw new Error("scheduler should not add workers when already initialized");
    },
    getNumWorkers: () => 1,
    getQueueLen: () => 0,
  };

  internals.scheduler = scheduler;
  internals.workerLanguageKey = "spa";
  internals.activeLanguage = "spa";

  const result = await internals.ensureInitialized();

  assert.strictEqual(result, scheduler);
});

test("prepareCanvasForOCR crops sparse content and upscales small regions", () => {
  const ocr = new SmartOCR();
  const internals = asInternals(ocr);
  const canvas: RasterCanvas = createRasterCanvas(2400, 2400);
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

test("performIDP throws when apiKey is missing", async () => {
  const ocr = new SmartOCR({
    structuredOutputOptions: {
      ai: { provider: "openai", model: "gpt-4o-mini" },
      schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    },
  });

  await assert.rejects(
    async () => asInternals(ocr).performIDP("some text"),
    /Missing API key for provider "openai"/,
  );
});

test("performIDP throws for unsupported provider", async () => {
  const ocr = new SmartOCR({
    structuredOutputOptions: {
      ai: { provider: "openai", model: "gpt-4o-mini", apiKey: "test-key" },
      schema: { type: "object", properties: {}, required: [] },
    },
  });

  (ocr as unknown as { structuredOutputOptions: { ai: { provider: string } } }).structuredOutputOptions.ai.provider =
    "unknown-provider";

  await assert.rejects(
    async () => asInternals(ocr).performIDP("text"),
    /Unsupported AI provider: unknown-provider/,
  );
});

test("performIDP openai: parses structured JSON from completion content", async () => {
  const ocr = new SmartOCR({
    structuredOutputOptions: {
      ai: { provider: "openai", model: "gpt-4o-mini", apiKey: "test-key" },
      schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    },
  });

  const restore = stubHttpsResponse(
    200,
    JSON.stringify({ choices: [{ message: { content: JSON.stringify({ name: "Jane" }) } }] }),
  );
  try {
    const result = await asInternals(ocr).performIDP("some text");
    assert.deepStrictEqual(result, { name: "Jane" });
  } finally {
    restore();
  }
});

test("performIDP openai: throws when choices content is null", async () => {
  const ocr = new SmartOCR({
    structuredOutputOptions: {
      ai: { provider: "openai", model: "gpt-4o-mini", apiKey: "test-key" },
      schema: { type: "object", properties: {}, required: [] },
    },
  });

  const restore = stubHttpsResponse(
    200,
    JSON.stringify({ choices: [{ message: { content: null } }] }),
  );
  try {
    await assert.rejects(async () => asInternals(ocr).performIDP("text"), /AI failed to return content/);
  } finally {
    restore();
  }
});

test("performIDP openai: throws when AI returns invalid JSON", async () => {
  const ocr = new SmartOCR({
    structuredOutputOptions: {
      ai: { provider: "openai", model: "gpt-4o-mini", apiKey: "test-key" },
      schema: { type: "object", properties: {}, required: [] },
    },
  });

  const restore = stubHttpsResponse(
    200,
    JSON.stringify({ choices: [{ message: { content: "not-json" } }] }),
  );
  try {
    await assert.rejects(async () => asInternals(ocr).performIDP("text"), /AI returned invalid JSON/);
  } finally {
    restore();
  }
});

test("performIDP anthropic: returns tool_use input directly", async () => {
  const ocr = new SmartOCR({
    structuredOutputOptions: {
      ai: { provider: "anthropic", model: "claude-opus-4-5", apiKey: "test-key" },
      schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    },
  });

  const restore = stubHttpsResponse(
    200,
    JSON.stringify({ content: [{ type: "tool_use", input: { name: "Jane" } }] }),
  );
  try {
    const result = await asInternals(ocr).performIDP("some text");
    assert.deepStrictEqual(result, { name: "Jane" });
  } finally {
    restore();
  }
});

test("performIDP anthropic: throws when no tool_use block is present", async () => {
  const ocr = new SmartOCR({
    structuredOutputOptions: {
      ai: { provider: "anthropic", model: "claude-opus-4-5", apiKey: "test-key" },
      schema: { type: "object", properties: {}, required: [] },
    },
  });

  const restore = stubHttpsResponse(
    200,
    JSON.stringify({ content: [{ type: "text" }] }),
  );
  try {
    await assert.rejects(async () => asInternals(ocr).performIDP("text"), /AI failed to return content/);
  } finally {
    restore();
  }
});

test("performIDP gemini: parses structured JSON from candidate text", async () => {
  const ocr = new SmartOCR({
    structuredOutputOptions: {
      ai: { provider: "gemini", model: "gemini-2.0-flash", apiKey: "test-key" },
      schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    },
  });

  const restore = stubHttpsResponse(
    200,
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ name: "Jane" }) }] } }] }),
  );
  try {
    const result = await asInternals(ocr).performIDP("some text");
    assert.deepStrictEqual(result, { name: "Jane" });
  } finally {
    restore();
  }
});

test("performIDP gemini: throws when candidates text is missing", async () => {
  const ocr = new SmartOCR({
    structuredOutputOptions: {
      ai: { provider: "gemini", model: "gemini-2.0-flash", apiKey: "test-key" },
      schema: { type: "object", properties: {}, required: [] },
    },
  });

  const restore = stubHttpsResponse(
    200,
    JSON.stringify({ candidates: [] }),
  );
  try {
    await assert.rejects(async () => asInternals(ocr).performIDP("text"), /AI failed to return content/);
  } finally {
    restore();
  }
});

test("normalizeSchemaForGemini converts array types and strips unsupported fields", () => {
  const normalize = asLLMStatic().normalizeSchemaForGemini;

  const input = {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string" },
      age: { type: ["integer", "null"] },
      dob: { type: ["string", "null"], format: "date" },
      updatedAt: { type: "string", format: "date-time" },
    },
    required: ["name", "age", "dob", "updatedAt"],
  };

  const output = normalize(input);

  assert.deepStrictEqual(output, {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "integer", nullable: true },
      dob: { type: "string", nullable: true },
      updatedAt: { type: "string", format: "date-time" },
    },
    required: ["name", "age", "dob", "updatedAt"],
  });
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
