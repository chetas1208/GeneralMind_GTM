import "server-only";
import { z } from "zod";
import { createLogger } from "@/lib/logger";
import { IntegrationError } from "@/lib/http";
import { firecrawlRequest } from "./client";
import { firecrawlScrapeResponseSchema, speakerExtractionSchema, type FirecrawlExtraction } from "./schemas";

const log = createLogger("firecrawl");

const JSON_SCHEMA = {
  type: "object",
  properties: {
    people: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          title: { type: "string" },
          company: { type: "string" },
          role: { type: "string", description: "speaker, moderator, panelist, keynote, etc." },
        },
        required: ["name"],
      },
    },
    companies: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          relationship: { type: "string", description: "sponsor, exhibitor, partner, organizer" },
          website: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
};

/**
 * Firecrawl's native JSON extraction for list-style pages (speakers/exhibitors).
 * Used as a structured complement to the model-based extractor in lib/ai.
 */
export async function extractStructured(url: string): Promise<FirecrawlExtraction> {
  const res = await firecrawlRequest(
    "/scrape",
    {
      url,
      formats: [
        {
          type: "json",
          prompt:
            "Extract every listed person (speaker, moderator, panelist) with their title and company, and every listed company with its relationship to the event (sponsor, exhibitor, partner, organizer). Only include what is explicitly on the page.",
          schema: JSON_SCHEMA,
        },
      ],
      onlyMainContent: true,
      timeout: 60_000,
    },
    firecrawlScrapeResponseSchema.extend({ data: z.object({ json: z.unknown().optional() }).passthrough().optional() }),
    90_000,
  );
  const parsed = speakerExtractionSchema.safeParse(res.data?.json ?? {});
  if (!parsed.success) {
    throw new IntegrationError("firecrawl", "malformed", "JSON extraction failed validation");
  }
  log.info("extracted", { url, people: parsed.data.people.length, companies: parsed.data.companies.length });
  return parsed.data;
}
