import { Canvas, CanvasRenderingContext2D, createCanvas } from "@napi-rs/canvas";

/**
 * Node canvas instance used for PDF rendering and OCR preprocessing.
 */
export type RasterCanvas = Canvas;

/**
 * 2D rendering context associated with a {@link RasterCanvas}.
 */
export type RasterCanvasContext = CanvasRenderingContext2D;

/**
 * Keeps PDF.js temporary canvases on the same `canvas` implementation we use
 * for page rendering, avoiding cross-library drawImage incompatibilities.
 */
export class PDFJSNodeCanvasFactory {
  /**
   * Creates a canvas factory that mirrors the interface expected by PDF.js.
   * The incoming options are accepted for API compatibility but are not used
   * because rendering is delegated directly to the Node `canvas` package.
   * @param _options Optional PDF.js factory settings.
   * @param _options.enableHWA Ignored hardware acceleration flag kept for PDF.js compatibility.
   * @param _options.ownerDocument Ignored document reference kept for PDF.js compatibility.
   */
  public constructor(_options: { enableHWA?: boolean; ownerDocument?: unknown } = {}) {}

  /**
   * Allocates a new canvas/context pair for PDF.js temporary rendering work.
   * @param width Target canvas width in pixels.
   * @param height Target canvas height in pixels.
   * @returns Canvas and 2D context pair understood by PDF.js.
   * @throws {Error} When the requested dimensions are invalid.
   */
  public create(width: number, height: number): { canvas: RasterCanvas; context: RasterCanvasContext } {
    if (width <= 0 || height <= 0) {
      throw new Error("Invalid canvas size");
    }

    const canvas = createCanvas(width, height);
    return {
      canvas,
      context: this.getContext(canvas),
    };
  }

  /**
   * Resizes an existing canvas/context pair so PDF.js can reuse it.
   * @param canvasAndContext Existing canvas/context pair.
   * @param canvasAndContext.canvas Existing canvas instance to resize.
   * @param canvasAndContext.context Existing 2D context paired with the canvas.
   * @param width New canvas width in pixels.
   * @param height New canvas height in pixels.
   * @throws {Error} When the canvas is missing or the requested size is invalid.
   */
  public reset(
    canvasAndContext: { canvas: RasterCanvas | null; context: RasterCanvasContext | null },
    width: number,
    height: number
  ): void {
    if (!canvasAndContext.canvas) {
      throw new Error("Canvas is not specified");
    }

    if (width <= 0 || height <= 0) {
      throw new Error("Invalid canvas size");
    }

    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
    canvasAndContext.context = this.getContext(canvasAndContext.canvas);
  }

  /**
   * Releases references to a canvas/context pair once PDF.js no longer needs it.
   * @param canvasAndContext Existing canvas/context pair.
   * @param canvasAndContext.canvas Existing canvas instance to release.
   * @param canvasAndContext.context Existing 2D context paired with the canvas.
   * @throws {Error} When the canvas is missing.
   */
  public destroy(canvasAndContext: { canvas: RasterCanvas | null; context: RasterCanvasContext | null }): void {
    if (!canvasAndContext.canvas) {
      throw new Error("Canvas is not specified");
    }

    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }

  /**
   * Gets a 2D context from a Node canvas instance.
   * @param canvas Canvas that should provide a drawing context.
   * @returns 2D rendering context for the supplied canvas.
   * @throws {Error} When the context cannot be created.
   */
  private getContext(canvas: RasterCanvas): RasterCanvasContext {
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to acquire a 2D canvas context for PDF rendering.");
    }
    return context;
  }
}
