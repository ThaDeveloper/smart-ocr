import type { Canvas, CanvasRenderingContext2D } from "@napi-rs/canvas";
import canvasBinding from "@napi-rs/canvas/js-binding.js";

/**
 * Node canvas instance used for PDF rendering and OCR preprocessing.
 *
 * Note: This is typed as `@napi-rs/canvas`'s public `Canvas`, but is created via
 * the internal N-API binding (`js-binding.js`) to avoid importing the package's
 * top-level entrypoint. The entrypoint pulls in `loadImage`, which lazy-loads
 * `http`/`https` and can be flagged by supply-chain scanners even when Smart OCR
 * never loads images from URLs.
 */
export type RasterCanvas = Canvas;

/**
 * 2D rendering context associated with a {@link RasterCanvas}.
 */
export type RasterCanvasContext = CanvasRenderingContext2D;

type CanvasElementConstructor = new (width: number, height: number) => RasterCanvas;

/**
 * Creates a raster canvas for PDF rendering and OCR preprocessing.
 * @param width Canvas width in pixels.
 * @param height Canvas height in pixels.
 * @returns Raster canvas instance.
 */
export function createRasterCanvas(width: number, height: number): RasterCanvas {
  const canvasElementConstructor = (canvasBinding as { CanvasElement: CanvasElementConstructor }).CanvasElement;
  return new canvasElementConstructor(width, height);
}
