# Smart OCR

[![npm version](https://img.shields.io/npm/v/smart-ocr?logo=npm)](https://www.npmjs.com/package/smart-ocr)
[![CI](https://github.com/ThaDeveloper/smart-ocr/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ThaDeveloper/smart-ocr/actions/workflows/ci.yml?query=branch%3Amain)
[![License](https://img.shields.io/npm/l/smart-ocr)](./LICENSE)
[![Socket Badge](https://badge.socket.dev/npm/package/smart-ocr/1.1.3)](https://badge.socket.dev/npm/package/smart-ocr/1.1.3)

`smart-ocr` is a Node.js OCR library for:

- text-based PDFs
- scanned PDFs
- mixed PDFs with both text-native and scanned pages
- PNG and other common raster image formats
- optional AI-assisted structured output from extracted OCR text

For PDFs, each page is handled independently. If a page already contains selectable text, Smart OCR extracts it directly. If a page is image-only, it renders the page and falls back to OCR.

## Requirements

- Node.js `>=20.6.0`

This package is designed for Node.js. It is not set up for browser use.

## Installation

```bash
npm install smart-ocr
```

## Quick Start

```ts
import { SmartOCR } from "smart-ocr";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ocr = new SmartOCR({ language: "eng", workerCount: 2 });

try {
  const pdfText = await ocr.processPDF(path.join(__dirname, "sample-scanned.pdf"));
  console.log(pdfText);
} finally {
  await ocr.terminate();
}
```

## Structured Output

Smart OCR can optionally turn extracted text into structured JSON.

- OCR still runs first
- the extracted text is then sent to an AI model to produce structured output

When `structuredOutputOptions.ai` is configured, `processFile()`, `processPDF()`, and `processImage()` return a JSON object instead of a plain text string.

Current provider support:

- `openai`

Example:

```ts
import { SmartOCR } from "smart-ocr";

const ocr = new SmartOCR({
  language: "eng",
  structuredOutputOptions: {
    ai: {
      provider: "openai",
      model: "gpt-4.1-mini",
      apiKey: process.env.OPENAI_API_KEY,
      prompt: "Extract the document fields. Use null when a value is missing or unclear.",
    },
    schema: {
      type: "object",
      properties: {
        fullName: { type: ["string", "null"] },
        idNumber: { type: ["string", "null"] },
        dateOfBirth: { type: ["string", "null"] },
        sex: { type: ["string", "null"] },
      },
      required: ["fullName", "idNumber", "dateOfBirth", "sex"],
      additionalProperties: false,
    },
  },
});

try {
  const result = await ocr.processFile("./id.pdf");
  console.log(result);
} finally {
  await ocr.terminate();
}
```

Notes for AI mode:

- `apiKey` is optional if `OPENAI_API_KEY` is already set in the environment
- `prompt` overrides the default extraction instruction
- `schema` should be a JSON schema describing the object you want back
- when using OpenAI strict JSON schema, `required` must include every key in `properties` (and must not include extra keys)
- today, AI-backed structured output is OpenAI-only
- when AI mode is enabled, the raw OCR text is not returned by these methods

## API

### `new SmartOCR(options?)`

Creates an OCR processor.

Options:

- `language`: Tesseract language or language list. Default: `"eng"`
- `pdfRenderScale`: render scale used before OCR on scanned PDF pages. Default: `2`
- `workerOptions`: options passed to the Tesseract worker, such as `langPath`, `cachePath`, or `logger`
- `workerCount`: Number of OCR workers to run in parallel.
- `structuredOutputOptions`: optional AI configuration for returning structured JSON instead of plain text

Language codes use Tesseract traineddata identifiers, not 2-letter locale codes. For example:

- `"eng"` for English
- `"spa"` for Spanish
- `"fra"` for French
- `["eng", "spa"]` for multilingual OCR

Use `"eng"`, not `"en"`.

`structuredOutputOptions` shape:

- `ai.provider`: AI provider name. Currently only `"openai"` is supported
- `ai.model`: model name to call for structured extraction
- `ai.apiKey`: Your OPENAI API key.
- `ai.prompt`: optional custom extraction prompt
- `schema`: JSON schema describing the expected response object

### `processFile(filePath)`

Routes a supported file to the correct handler based on file extension.

Returns:

- extracted text by default
- structured JSON when `structuredOutputOptions.ai` is configured

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

The OCR language only affects scanned/image-only pages. If a PDF page already contains selectable text, Smart OCR returns that embedded text directly instead of re-OCRing it.

Returns:

- extracted text by default
- structured JSON when `structuredOutputOptions.ai` is configured

### `processImage(imagePath)`

Runs OCR on an image file.

Returns:

- extracted text by default
- structured JSON when `structuredOutputOptions.ai` is configured

### `init(language?)`

Eagerly initializes the Tesseract worker. This is optional because processing methods initialize on demand.

If you pass a language to `init(language)`, Smart OCR keeps using that language for later OCR calls until you switch it again or create a new instance.

### `terminate()`

Terminates the Tesseract worker and frees resources.

## Notes

- Smart OCR is optimized for Node.js workloads, not browser runtimes.
- Rendering uses [`@napi-rs/canvas`](https://www.npmjs.com/package/@napi-rs/canvas), which avoids the extra Cairo system setup required by `canvas`.
- Scanned PDFs are preprocessed before OCR so sparse content, such as ID cards on large blank pages, is easier to detect.
- Structured output is an optional post-processing step on top of OCR, not a replacement for OCR itself.
- AI mode currently supports OpenAI only.
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

To run the sample in AI mode:

```bash
SMART_OCR_SAMPLE_AI=1 OPENAI_API_KEY=... npm run sample
```

## License

MIT
