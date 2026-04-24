/**
 * Best-effort parsing of an HTTP error body for better exception messages.
 * @param contentType Content-Type header value from the error response.
 * @param body Raw response body string.
 * @returns Short string describing the error.
 */
export function safeReadErrorBody(contentType: string, body: string): string {
  try {
    if (contentType.includes("application/json")) {
      const data = JSON.parse(body) as { error?: { message?: string } };
      const message = data?.error?.message;
      return message ? `Error: ${message}` : "Error: request failed.";
    }

    return body ? `Error: ${body.slice(0, 500)}` : "Error: request failed.";
  } catch {
    return "Error: request failed.";
  }
}
