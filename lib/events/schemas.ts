import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .max(2_000)
  .nullish()
  .transform((v) => (v ? v : null));
const optionalUrl = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https?:\/\//i.test(v), "must be an http(s) URL");
const optionalDate = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "must be yyyy-mm-dd");
const tags = z.array(z.string().trim().min(1).max(60)).max(25).default([]);

export const eventInputSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: optionalText,
  websiteUrl: optionalUrl,
  registrationUrl: optionalUrl,
  startDate: optionalDate,
  endDate: optionalDate,
  city: optionalText,
  region: optionalText,
  country: optionalText,
  venue: optionalText,
  industryTags: tags,
  audienceTags: tags,
  agendaThemes: tags,
  targetPersonas: tags,
  relevanceReason: optionalText,
  status: z.enum(["discovered", "selected", "rejected", "archived"]).default("discovered"),
});

export const eventPatchSchema = eventInputSchema.partial();
export type EventInput = z.infer<typeof eventInputSchema>;
