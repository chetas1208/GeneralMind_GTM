import { z } from "zod";

export const firecrawlScrapeResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      markdown: z.string().nullable().optional(),
      json: z.unknown().optional(),
      metadata: z
        .object({
          title: z.string().nullable().optional(),
          sourceURL: z.string().nullable().optional(),
          statusCode: z.number().nullable().optional(),
        })
        .passthrough()
        .optional(),
    })
    .optional(),
  error: z.string().optional(),
});

export type FirecrawlScrape = {
  url: string;
  title: string | null;
  markdown: string;
  statusCode: number | null;
};

export const speakerExtractionSchema = z.object({
  people: z
    .array(
      z.object({
        name: z.string(),
        title: z.string().nullable().optional(),
        company: z.string().nullable().optional(),
        role: z.string().nullable().optional(),
      }),
    )
    .default([]),
  companies: z
    .array(
      z.object({
        name: z.string(),
        relationship: z.string().nullable().optional(),
        website: z.string().nullable().optional(),
      }),
    )
    .default([]),
});

export type FirecrawlExtraction = z.infer<typeof speakerExtractionSchema>;
