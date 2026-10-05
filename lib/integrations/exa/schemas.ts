import { z } from "zod";

export const exaResultSchema = z.object({
  id: z.string().optional(),
  title: z.string().nullable().optional(),
  url: z.string(),
  publishedDate: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
  score: z.number().nullable().optional(),
  text: z.string().nullable().optional(),
  highlights: z.array(z.string()).nullable().optional(),
  summary: z.string().nullable().optional(),
});

export const exaSearchResponseSchema = z.object({
  requestId: z.string().optional(),
  results: z.array(exaResultSchema).default([]),
  costDollars: z.object({ total: z.number().optional() }).passthrough().optional(),
});

export type ExaResult = z.infer<typeof exaResultSchema>;
export type ExaSearchResponse = z.infer<typeof exaSearchResponseSchema>;

export const exaSearchInputSchema = z.object({
  query: z.string().min(2),
  numResults: z.number().int().min(1).max(25).default(8),
  type: z.enum(["auto", "neural", "fast", "deep"]).default("auto"),
  includeDomains: z.array(z.string()).optional(),
  excludeDomains: z.array(z.string()).optional(),
  startPublishedDate: z.string().optional(),
  category: z.enum(["company", "news", "linkedin profile", "people"]).optional(),
  maxCharacters: z.number().int().min(200).max(20_000).default(3_000),
});

export type ExaSearchInput = z.input<typeof exaSearchInputSchema>;
