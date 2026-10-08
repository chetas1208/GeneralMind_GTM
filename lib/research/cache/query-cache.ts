import type { ExaResult } from "@/lib/integrations/exa/schemas";
import { normalizeQueryString } from "../compiler/query-deduper";

type CacheEntry = {
  results: ExaResult[];
  savedAt: number;
};

// In-memory query cache with 2-hour TTL
const cache = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;

export function getCachedQueryResult(query: string, ttlMs: number = DEFAULT_TTL_MS): ExaResult[] | null {
  const key = normalizeQueryString(query);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.savedAt > ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.results;
}

export function setCachedQueryResult(query: string, results: ExaResult[]): void {
  const key = normalizeQueryString(query);
  cache.set(key, { results, savedAt: Date.now() });
}

export function clearQueryCache(): void {
  cache.clear();
}
