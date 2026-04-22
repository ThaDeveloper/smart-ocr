export type StructuredOutputOptions = {
  ai: {
    /**
     * The AI provider to use for generating structured output. Currently, only "openai" is supported.
     */
    provider: "openai";
    /**
     * The model to use for generating structured output.
     */
    model: string;
    /**
     * An optional API key for the AI provider.
     */
    apiKey?: string;
    /**
     * An optional prompt to guide the AI in generating structured output.
     */
    prompt?: string;
  };
  /**
   * The schema that defines the structure of the output.
   */
  schema: {
    [key: string]: unknown;
  };
};
