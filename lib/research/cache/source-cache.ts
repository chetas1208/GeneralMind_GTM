import { normalizeUrl } from "@/lib/text";

type ScrapeEntry = {
  text: string;
  title: string | null;
  savedAt: number;
};

// 24-hour freshness for scraped event / company pages
const cache = new Map<string, ScrapeEntry>();
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export function getCachedScrape(url: string, ttlMs: number = DEFAULT_TTL_MS): { text: string; title: string | null } | null {
  const key = normalizeUrl(url) || url.toLowerCase();
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.savedAt > ttlMs) {
    cache.delete(key);
    return null;
  }
  return { text: entry.text, title: entry.title };
}

export function setCachedScrape(url: string, text: string, title?: string | null): void {
  const key = normalizeUrl(url) || url.toLowerCase();
  cache.set(key, { text, title: title ?? null, savedAt: Date.now() });
}

export function clearSourceCache(): void {
  cache.clear();
}
