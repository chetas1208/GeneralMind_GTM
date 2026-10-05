/** Strip credentials from a message before it is stored or returned. */
export function sanitizeStoredError(message: string): string {
  return message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted-url]")
    .replace(/nvapi-[\w-]+/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(?:pat|fc)-[\w-]+/g, "[redacted]")
    .slice(0, 500);
}
