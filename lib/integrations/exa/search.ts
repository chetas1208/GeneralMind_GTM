import "server-only";
import { createLogger } from "@/lib/logger";
import { exaRequest } from "./client";
import {
  exaSearchInputSchema,
  exaSearchResponseSchema,
  type ExaResult,
  type ExaSearchInput,
} from "./schemas";

const log = createLogger("exa");

export type ExaSearchOutput = { results: ExaResult[]; costUsd?: number };

/** Neural/keyword web search returning page text so downstream stages can often skip scraping. */
export async function exaSearch(input: ExaSearchInput): Promise<ExaSearchOutput> {
  const p = exaSearchInputSchema.parse(input);
  const res = await exaRequest(
    "/search",
    {
      query: p.query,
      type: p.type,
      numResults: p.numResults,
      ...(p.includeDomains ? { includeDomains: p.includeDomains } : {}),
      ...(p.excludeDomains ? { excludeDomains: p.excludeDomains } : {}),
      ...(p.startPublishedDate ? { startPublishedDate: p.startPublishedDate } : {}),
      ...(p.category ? { category: p.category } : {}),
      contents: { text: { maxCharacters: p.maxCharacters } },
    },
    exaSearchResponseSchema,
  );
  log.info("search", { query: p.query.slice(0, 80), results: res.results.length, costUsd: res.costDollars?.total });
  return { results: dedupeByUrl(res.results), costUsd: res.costDollars?.total };
}

export function dedupeByUrl(results: ExaResult[]): ExaResult[] {
  const seen = new Set<string>();
  const out: ExaResult[] = [];
  for (const r of results) {
    const key = r.url.replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** Cheap connectivity probe used by /system. */
export async function exaHealthCheck() {
  const r = await exaSearch({ query: "supply chain conference", numResults: 1, maxCharacters: 200 });
  return { results: r.results.length };
}
