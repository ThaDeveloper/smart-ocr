import https from "node:https";
import { safeReadErrorBody } from "./helpers/requests";

/**
 * LLM class provides static methods to interact with various AI providers for generating structured output based on OCR text.
 */
export class LLM {
  /**
   * Calls OpenAI's Chat Completions API using the Node.js built-in https module.
   * @param params OpenAI request parameters.
   * @param params.apiKey OpenAI API key.
   * @param params.model OpenAI model name.
   * @param params.prompt System prompt used for extraction.
   * @param params.text Raw OCR text to extract from.
   * @param params.schema JSON schema describing the expected response shape.
   * @returns Parsed OpenAI response.
   */
  public static async createOpenAIChatCompletion(params: {
    apiKey: string;
    model: string;
    prompt: string;
    text: string;
    schema: Record<string, unknown>;
  }): Promise<{ choices: Array<{ message: { content: string | null } }> }> {
    const body = JSON.stringify({
      model: params.model,
      messages: [
        { role: "system", content: params.prompt },
        { role: "user", content: params.text },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "extracted_data",
          strict: true,
          schema: params.schema,
        },
      },
    });

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: "api.openai.com",
          path: "/v1/chat/completions",
          method: "POST",
          headers: {
            Authorization: `Bearer ${params.apiKey}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("error", reject);
          res.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            if (res.statusCode && res.statusCode >= 400) {
              const detail = safeReadErrorBody(res.headers["content-type"] ?? "", raw);
              reject(new Error(`OpenAI request failed (${res.statusCode} ${res.statusMessage}). ${detail}`));
              return;
            }
            try {
              resolve(JSON.parse(raw) as { choices: Array<{ message: { content: string | null } }> });
            } catch (error) {
              reject(new Error(`OpenAI returned invalid JSON. ${(error as Error).message || String(error)}`));
            }
          });
        }
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });
  }

  /**
   * Calls Anthropic's Messages API using tool use to enforce structured JSON output.
   * @param params Anthropic request parameters.
   * @param params.apiKey Anthropic API key.
   * @param params.model Anthropic model name.
   * @param params.prompt System prompt used for extraction.
   * @param params.text Raw OCR text to extract from.
   * @param params.schema JSON schema describing the expected response shape.
   * @returns Parsed Anthropic response.
   */
  public static async createAnthropicChatCompletion(params: {
    apiKey: string;
    model: string;
    prompt: string;
    text: string;
    schema: Record<string, unknown>;
  }): Promise<{ content: Array<{ type: string; input?: Record<string, unknown> }> }> {
    const body = JSON.stringify({
      model: params.model,
      max_tokens: 4096,
      system: params.prompt,
      messages: [{ role: "user", content: params.text }],
      tools: [
        {
          name: "extracted_data",
          description: "Extracted structured data from the document.",
          input_schema: params.schema,
        },
      ],
      tool_choice: { type: "tool", name: "extracted_data" },
    });

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: "api.anthropic.com",
          path: "/v1/messages",
          method: "POST",
          headers: {
            "x-api-key": params.apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("error", reject);
          res.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            if (res.statusCode && res.statusCode >= 400) {
              const detail = safeReadErrorBody(res.headers["content-type"] ?? "", raw);
              reject(new Error(`Anthropic request failed (${res.statusCode} ${res.statusMessage}). ${detail}`));
              return;
            }
            try {
              resolve(JSON.parse(raw) as { content: Array<{ type: string; input?: Record<string, unknown> }> });
            } catch (error) {
              reject(new Error(`Anthropic returned invalid JSON. ${(error as Error).message || String(error)}`));
            }
          });
        }
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });
  }

  /**
   * Calls Google Gemini's generateContent API with a response schema to enforce structured JSON output.
   * @param params Gemini request parameters.
   * @param params.apiKey Google API key.
   * @param params.model Gemini model name.
   * @param params.prompt System instruction used for extraction.
   * @param params.text Raw OCR text to extract from.
   * @param params.schema JSON schema describing the expected response shape.
   * @returns Parsed Gemini response.
   */
  public static async createGeminiChatCompletion(params: {
    apiKey: string;
    model: string;
    prompt: string;
    text: string;
    schema: Record<string, unknown>;
  }): Promise<{ candidates: Array<{ content: { parts: Array<{ text: string }> } }> }> {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: params.prompt }] },
      contents: [{ role: "user", parts: [{ text: params.text }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: this.normalizeSchemaForGemini(params.schema),
      },
    });

    const modelPath = `/v1beta/models/${encodeURIComponent(params.model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`;

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: "generativelanguage.googleapis.com",
          path: modelPath,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("error", reject);
          res.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            if (res.statusCode && res.statusCode >= 400) {
              const detail = safeReadErrorBody(res.headers["content-type"] ?? "", raw);
              reject(new Error(`Gemini request failed (${res.statusCode} ${res.statusMessage}). ${detail}`));
              return;
            }
            try {
              resolve(JSON.parse(raw) as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> });
            } catch (error) {
              reject(new Error(`Gemini returned invalid JSON. ${(error as Error).message || String(error)}`));
            }
          });
        }
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });
  }

  /**
   * Converts a standard JSON Schema object into a Gemini-compatible schema.
   * Gemini uses a restricted OpenAPI 3.0 subset and does not support:
   * - array `type` values (e.g. `["string", "null"]`) — use `nullable: true` instead
   * - `additionalProperties`
   * - `format` values other than "float", "double", "int32", "int64", "date-time"
   * @param schema Input JSON schema node.
   * @returns Normalized schema safe for Gemini's responseSchema field.
   */
  private static normalizeSchemaForGemini(schema: Record<string, unknown>): Record<string, unknown> {
    const GEMINI_SUPPORTED_FORMATS = new Set(["float", "double", "int32", "int64", "date-time"]);
    const UNSUPPORTED_KEYS = new Set(["additionalProperties", "$schema", "$id", "definitions", "$defs"]);

    /**
     * Normalizes a JSON schema node by recursively removing unsupported constructs and converting array types to nullable.
     * @param node JSON schema node to normalize.
     * @returns Normalized JSON schema node.
     */
    function normalize(node: unknown): unknown {
      if (typeof node !== "object" || node === null || Array.isArray(node)) {
        return node;
      }

      const input = node as Record<string, unknown>;
      const output: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(input)) {
        if (UNSUPPORTED_KEYS.has(key)) {
          continue;
        }

        if (key === "type" && Array.isArray(value)) {
          const types = value as string[];
          const nonNull = types.filter((t) => t !== "null");
          output["type"] = nonNull.length === 1 ? nonNull[0] : (nonNull[0] ?? "string");
          if (types.includes("null")) {
            output["nullable"] = true;
          }
          continue;
        }

        if (key === "format") {
          if (typeof value === "string" && GEMINI_SUPPORTED_FORMATS.has(value)) {
            output["format"] = value;
          }
          continue;
        }

        if (key === "properties" && typeof value === "object" && value !== null) {
          const props: Record<string, unknown> = {};
          for (const [propKey, propVal] of Object.entries(value as Record<string, unknown>)) {
            props[propKey] = normalize(propVal);
          }
          output["properties"] = props;
          continue;
        }

        if (key === "items") {
          output["items"] = normalize(value);
          continue;
        }

        output[key] = value;
      }

      return output;
    }

    return normalize(schema) as Record<string, unknown>;
  }
}
