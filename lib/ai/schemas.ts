import { z } from "zod";
import { PERSONAS } from "@/lib/scoring/types";

const str = z.string().trim();
/** Over-long prose is trimmed (at a word boundary) rather than failing validation: length is cosmetic, not a trust issue. */
const clip = (n: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v.length <= n ? v : `${v.slice(0, n - 1).replace(/\s+\S*$/, "")}…`));
const nullableStr = z.string().trim().nullish().transform((v) => (v ? v : null));
const strList = z.array(str).default([]).transform((a) => a.filter(Boolean).slice(0, 25));
const isoDate = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null));
const rating = z.enum(["low", "medium", "high"]);

/** Output of extracting one event from a web page. */
export const eventCandidateSchema = z.object({
  isEvent: z.boolean(),
  /** True only when THIS page is hosted by the event's organiser (its own website). */
  isOfficialSite: z.boolean().default(false),
  /** Why this page is / is not a real, specific, upcoming event. */
  rationale: str.default(""),
  name: nullableStr,
  startDate: isoDate,
  endDate: isoDate,
  city: nullableStr,
  region: nullableStr,
  country: nullableStr,
  venue: nullableStr,
  description: nullableStr,
  officialUrl: nullableStr,
  registrationUrl: nullableStr,
  industries: strList,
  audiences: strList,
  agendaThemes: strList,
});
export type EventCandidate = z.infer<typeof eventCandidateSchema>;

/** Categorical (not numeric) assessment; numeric score is computed in lib/scoring. */
export const eventAssessmentSchema = z.object({
  decisionMakerDensity: rating,
  scale: rating,
  industries: strList,
  audiences: strList,
  targetPersonas: strList,
  agendaThemes: strList,
  reason: clip(600),
});
export type EventAssessment = z.infer<typeof eventAssessmentSchema>;

export const participantsSchema = z.object({
  people: z
    .array(
      z.object({
        name: str.min(3),
        title: nullableStr,
        company: nullableStr,
        role: nullableStr,
      }),
    )
    .default([]),
  companies: z
    .array(
      z.object({
        name: str.min(2),
        relationship: z.enum(["sponsor", "exhibitor", "partner", "organizer", "speaker_company", "unknown"]).catch("unknown"),
      }),
    )
    .default([]),
});
export type ParticipantsExtraction = z.infer<typeof participantsSchema>;

export const personaClassificationSchema = z.object({
  persona: z.enum(PERSONAS),
  seniority: z.enum(["c_suite", "vp", "head", "director", "manager", "individual", "unknown"]),
});
export type PersonaClassification = z.infer<typeof personaClassificationSchema>;

export const companyFitSummarySchema = z.object({
  summary: clip(500),
  operationalSignals: strList,
});
export type CompanyFitSummary = z.infer<typeof companyFitSummarySchema>;

export const qualificationExplanationSchema = z.object({
  whyCompanyFits: clip(400),
  whyPersonMatters: clip(400),
  eventLink: clip(500),
  uncertainty: clip(400),
  nextStep: clip(300),
});
export type QualificationExplanation = z.infer<typeof qualificationExplanationSchema>;

/** Current role read from a public profile page; the quote is verified against the page text in code. */
export const profileRoleSchema = z.object({
  fullName: nullableStr,
  isCurrent: z.boolean(),
  currentTitle: nullableStr,
  currentCompany: nullableStr,
  /** Verbatim text copied from the page that states the current title/company. */
  quote: nullableStr,
});
export type ProfileRole = z.infer<typeof profileRoleSchema>;
