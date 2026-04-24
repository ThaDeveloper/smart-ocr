import https from "node:https";
import { SmartOCR } from "../src/ocrProcessor";
import { LLM } from "../src/llm";
import type { RasterCanvas } from "../src/PDFJSNodeCanvasFactory";

export type SmartOCRMock = {
  createOpenAIChatCompletion: (...args: unknown[]) => unknown;
  createAnthropicChatCompletion: (...args: unknown[]) => unknown;
  createGeminiChatCompletion: (...args: unknown[]) => unknown;
};

export type LLMMock = {
  normalizeSchemaForGemini: (schema: Record<string, unknown>) => Record<string, unknown>;
};

export type OCRInternals = {
  activeLanguage: string | string[];
  scheduler?: unknown;
  workerLanguageKey?: string | null;
  loadPDFDocument: (pdfPath: string) => Promise<{
    numPages: number;
    getPage: (pageNumber: number) => Promise<{ cleanup: () => void; result: string }>;
    cleanup: () => Promise<void>;
    destroy: () => Promise<void>;
  }>;
  extractPageTextWithFallback: (page: { cleanup: () => void; result: string }) => Promise<string>;
  extractPageText: (page: unknown) => Promise<string>;
  ensureInitialized: (language?: string | string[]) => Promise<unknown>;
  ocrPage: (page: unknown, scheduler: unknown) => Promise<string>;
  prepareCanvasForOCR: (canvas: RasterCanvas) => RasterCanvas;
  performIDP: (text: string) => Promise<{ [key: string]: unknown }>;
};

/**
 * Casts the SmartOCR constructor to a shape that exposes private static methods for testing.
 * @returns SmartOCR constructor with private statics exposed.
 */
export function asStatic(): SmartOCRMock {
  return SmartOCR as unknown as SmartOCRMock;
}

/**
 * Casts the LLM constructor to a shape that exposes private static methods for testing.
 * @returns LLM constructor with private statics exposed.
 */
export function asLLMStatic(): LLMMock {
  return LLM as unknown as LLMMock;
}

/**
 * Casts an OCR instance to a shape that exposes private instance methods for testing.
 * @param ocr - OCR instance under test.
 * @returns OCR instance with private methods exposed.
 */
export function asInternals(ocr: SmartOCR): OCRInternals {
  return ocr as unknown as OCRInternals;
}

/**
 * Replaces https.request with a stub that delivers the given JSON body and status code.
 * Both the data and end events are scheduled with setImmediate so the response
 * handlers set up inside the callback have already been registered before they fire.
 *
 * @param statusCode - HTTP status code for the stub response.
 * @param body - Raw response body string (should be valid JSON for success paths).
 * @returns Cleanup function that restores the original https.request.
 */
export function stubHttpsResponse(statusCode: number, body: string): () => void {
  const mod = https as unknown as { request: unknown };
  const original = mod.request;

  /**
   * Stubs the https.request method to simulate a response with the given status code and body.
   * @param _options - Request options (ignored in the stub).
   * @param callback - Callback to handle the fake response.
   * @returns Fake request object.
   */
  mod.request = function (_options: unknown, callback?: (res: unknown) => void): unknown {
    const handlers: { data?: (chunk: Buffer) => void; end?: () => void } = {};

    const fakeRes = {
      statusCode,
      statusMessage: statusCode < 400 ? "OK" : "Error",
      headers: { "content-type": "application/json" },
      /**
       * Registers event handlers for the fake response.
       * @param event - Event name ("data" or "end").
       * @param fn - Callback function for the event.
       * @returns The fake response object for chaining.
       */
      on(event: string, fn: (...args: unknown[]) => void) {
        if (event === "data") handlers.data = fn as (chunk: Buffer) => void;
        else if (event === "end") handlers.end = fn as () => void;
        return fakeRes;
      },
    };

    const fakeReq = {
      /**
       * Registers event handlers for the fake request.
       * @param _event - Event name (ignored in the stub).
       * @param _fn - Callback function for the event (ignored in the stub).
       * @returns The fake request object for chaining.
       */
      on(_event: string, _fn: unknown) {
        return fakeReq;
      },
      /**
       * Writes data to the fake request.
       * @param _data - Data to write (ignored in the stub).
       * @returns True to indicate the write was successful.
       */
      write(_data: unknown) {
        return true;
      },
      /**
       * Ends the fake request and triggers the fake response.
       * @returns The fake request object for chaining.
       */
      end() {
        callback?.(fakeRes);
        setImmediate(() => {
          handlers.data?.(Buffer.from(body));
          setImmediate(() => handlers.end?.());
        });
        return fakeReq;
      },
    };

    return fakeReq;
  };

  return () => {
    mod.request = original;
  };
}
