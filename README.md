# Smart OCR

`smart-ocr` extracts text from:

- text-based PDFs
- scanned PDFs
- PNG and other common raster image files

For PDFs, it checks each page individually. Pages with selectable text are read directly, and image-only pages fall back to OCR.

## Installation

```bash
npm install smart-ocr
```

## Usage

```ts
import { SmartOCR } from "smart-ocr";

const ocr = new SmartOCR({ language: "eng" });

try {
  const pdfText = await ocr.processPDF("./document.pdf");
  const imageText = await ocr.processImage("./page.png");
  const autoText = await ocr.processFile("./anything.pdf");

  console.log(pdfText, imageText, autoText);
} finally {
  await ocr.terminate();
}
```

## API

### `new SmartOCR(options?)`

Options:

- `language`: Tesseract language or language list. Defaults to `"eng"`.
- `pdfRenderScale`: Render scale used before OCRing scanned PDF pages. Defaults to `2`.
- `workerOptions`: Tesseract worker options such as `langPath`, `cachePath`, or `logger`.

### `processFile(filePath)`

Routes supported files to the right handler based on extension.

### `processPDF(pdfPath)`

Extracts text from each PDF page, using OCR only when direct text extraction is unavailable for that page.

### `processImage(imagePath)`

Runs OCR on an image file.

### `init(language?)`

Eagerly initializes the OCR worker. This is optional because processing methods initialize on demand.

### `terminate()`

Stops the Tesseract worker and frees related resources.

## Development

```bash
npm run typecheck
npm test
npm run build
npm run sample
```
