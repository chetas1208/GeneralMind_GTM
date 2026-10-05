import "server-only";
import { createLogger } from "@/lib/logger";
import { IntegrationError } from "@/lib/http";
import { firecrawlRequest } from "./client";
import { firecrawlScrapeResponseSchema, type FirecrawlScrape } from "./schemas";

const log = createLogger("firecrawl");

const MAX_MARKDOWN_CHARS = 60_000;

/** Render + scrape a page to markdown. Use only when Exa content was insufficient. */
export async function scrapePage(url: string, opts: { waitForMs?: number } = {}): Promise<FirecrawlScrape> {
  const res = await firecrawlRequest(
    "/scrape",
    {
      url,
      formats: ["markdown"],
      onlyMainContent: true,
      timeout: 45_000,
      ...(opts.waitForMs ? { waitFor: opts.waitForMs } : {}),
    },
    firecrawlScrapeResponseSchema,
    60_000,
  );
  if (!res.success || !res.data?.markdown) {
    throw new IntegrationError("firecrawl", "malformed", res.error ?? "Scrape returned no markdown");
  }
  const markdown = res.data.markdown.slice(0, MAX_MARKDOWN_CHARS);
  log.info("scraped", { url, chars: markdown.length });
  return {
    url,
    title: res.data.metadata?.title ?? null,
    markdown,
    statusCode: res.data.metadata?.statusCode ?? null,
  };
}

/** Cheap connectivity probe used by /system. */
export async function firecrawlHealthCheck() {
  const r = await scrapePage("https://example.com");
  return { chars: r.markdown.length };
}
