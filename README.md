# Smart OCR

[![npm version](https://img.shields.io/npm/v/smart-ocr?logo=npm)](https://www.npmjs.com/package/smart-ocr)
[![CI](https://github.com/ThaDeveloper/smart-ocr/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ThaDeveloper/smart-ocr/actions/workflows/ci.yml?query=branch%3Amain)
[![Node Version](https://img.shields.io/node/v/smart-ocr?logo=node.js)](https://www.npmjs.com/package/smart-ocr)
[![License](https://img.shields.io/npm/l/smart-ocr)](./LICENSE)

`smart-ocr` is a Node.js OCR library for:

- text-based PDFs
- scanned PDFs
- mixed PDFs with both text-native and scanned pages
- PNG and other common raster image formats

For PDFs, each page is handled independently. If a page already contains selectable text, Smart OCR extracts it directly. If a page is image-only, it renders the page and falls back to OCR.

## Requirements

- Node.js `>=18.18`
- an environment that can install and run [`canvas`](https://www.npmjs.com/package/canvas)

This package is designed for Node.js. It is not set up for browser use.

## Installation

```bash
npm install smart-ocr
```

## Quick Start

```ts
import { SmartOCR } from "smart-ocr";

const ocr = new SmartOCR({ language: "eng" });

try {
  const pdfText = await ocr.processPDF("./document.pdf");
  const imageText = await ocr.processImage("./page.png");
  const autoText = await ocr.processFile("./document.pdf");

  console.log(pdfText);
  console.log(imageText);
  console.log(autoText);
} finally {
  await ocr.terminate();
}
```

## API

### `new SmartOCR(options?)`

Creates an OCR processor.

Options:

- `language`: Tesseract language or language list. Default: `"eng"`
- `pdfRenderScale`: render scale used before OCR on scanned PDF pages. Default: `2`
- `workerOptions`: options passed to the Tesseract worker, such as `langPath`, `cachePath`, or `logger`

### `processFile(filePath)`

Routes a supported file to the correct handler based on file extension.

Supported extensions:

- `.pdf`
- `.png`
- `.jpg`
- `.jpeg`
- `.tif`
- `.tiff`
- `.bmp`
- `.webp`
- `.gif`

### `processPDF(pdfPath)`

Extracts text from a PDF. Text-native pages are read directly. Scanned pages are rendered to images and OCRed.

### `processImage(imagePath)`

Runs OCR on an image file.

### `init(language?)`

Eagerly initializes the Tesseract worker. This is optional because processing methods initialize on demand.

### `terminate()`

Terminates the Tesseract worker and frees resources.

## Notes

- Smart OCR is optimized for Node.js workloads, not browser runtimes.
- Scanned PDFs are preprocessed before OCR so sparse content, such as ID cards on large blank pages, is easier to detect.
- OCR quality still depends on the source document quality, scan resolution, and language data.

## Development

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run sample
```

`npm run sample` builds the library and runs it against the bundled sample files in `src/`.

## License

MIT
