/**
 * Evidence/source URLs come from scraped or model-adjacent data. Only http(s) URLs are ever rendered as links;
 * `javascript:`, `data:` and malformed values return null so the UI shows plain text instead.
 */
export function safeHref(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
