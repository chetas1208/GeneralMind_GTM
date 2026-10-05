import "server-only";
import { extractStructuredData } from "./provider";
import { prompts } from "./prompts";
import {
  companyFitSummarySchema,
  eventAssessmentSchema,
  eventCandidateSchema,
  participantsSchema,
  personaClassificationSchema,
  profileRoleSchema,
  qualificationExplanationSchema,
  type CompanyFitSummary,
  type EventAssessment,
  type EventCandidate,
  type ParticipantsExtraction,
  type PersonaClassification,
  type ProfileRole,
  type QualificationExplanation,
} from "./schemas";
import { sanitizeText } from "@/lib/text";

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Extract one event candidate from a page. */
export function extractEventCandidate(page: { url: string; title?: string | null; text: string }): Promise<EventCandidate> {
  return extractStructuredData(
    eventCandidateSchema,
    {
      system: prompts.eventCandidate(todayIso()).system,
      user: `URL: ${page.url}\nTitle: ${page.title ?? ""}\n\nPAGE TEXT:\n${page.text.slice(0, 14_000)}`,
      maxTokens: 1_500,
    },
    { label: "eventCandidate" },
  );
}

/** Categorical relevance assessment of an event (numeric score computed in lib/scoring). */
export function analyzeEventRelevance(event: {
  name: string;
  description?: string | null;
  text: string;
}): Promise<EventAssessment> {
  return extractStructuredData(
    eventAssessmentSchema,
    {
      system: prompts.eventAssessment().system,
      user: `EVENT: ${event.name}\n${event.description ?? ""}\n\nSOURCE TEXT:\n${event.text.slice(0, 20_000)}`,
      maxTokens: 1_200,
    },
    { label: "eventAssessment" },
  );
}

/** Extract participants from one chunk of an event page. */
export function extractParticipants(page: {
  eventName: string;
  pageKind: string;
  text: string;
}): Promise<ParticipantsExtraction> {
  return extractStructuredData(
    participantsSchema,
    {
      system: prompts.participants(page.eventName, page.pageKind).system,
      user: `PAGE TEXT:\n${page.text}`,
      maxTokens: 4_000,
    },
    { label: "participants" },
  );
}

/** Generic structured extraction hook for ad-hoc schemas. */
export { extractStructuredData };

/** Used only when the deterministic title classifier is inconclusive. */
export function classifyPersona(title: string): Promise<PersonaClassification> {
  return extractStructuredData(
    personaClassificationSchema,
    { system: prompts.persona().system, user: `Job title: ${title.slice(0, 200)}`, maxTokens: 100 },
    { label: "persona" },
  );
}

export function summarizeCompanyFit(profile: {
  name: string;
  industry?: string | null;
  employeeCount?: number | null;
  description?: string | null;
  keywords?: string[];
}): Promise<CompanyFitSummary> {
  return extractStructuredData(
    companyFitSummarySchema,
    {
      system: prompts.companyFit().system,
      user: JSON.stringify({ ...profile, description: sanitizeText(profile.description ?? "").slice(0, 1_500), keywords: (profile.keywords ?? []).slice(0, 30) }),
      maxTokens: 600,
    },
    { label: "companyFit" },
  );
}

export type QualificationInput = {
  person: { name: string; title: string | null };
  company: { name: string; industry: string | null; employeeCount: number | null };
  event: { name: string; startDate: string | null };
  attendanceType: string;
  attendanceConfidence: number;
  score: { company: number; persona: number; intent: number; total: number };
  scoreFactors: { label: string; points: number; max: number; note: string }[];
  evidence: { type: string; text: string; url: string }[];
  emailKnown: boolean;
};

/** Runs AFTER deterministic scoring; explains, never alters. */
export function explainQualification(input: QualificationInput): Promise<QualificationExplanation> {
  return extractStructuredData(
    qualificationExplanationSchema,
    {
      system: prompts.qualification().system,
      user: JSON.stringify(
        { ...input, evidence: input.evidence.slice(0, 8).map((e) => ({ ...e, text: e.text.slice(0, 400) })) },
        null,
        1,
      ),
      maxTokens: 900,
    },
    { label: "qualification" },
  );
}

export function extractProfileRole(profile: { url: string; text: string }): Promise<ProfileRole> {
  return extractStructuredData(
    profileRoleSchema,
    {
      system: prompts.profileRole().system,
      user: `URL: ${profile.url}\n\nPROFILE TEXT:\n${profile.text.slice(0, 5_000)}`,
      maxTokens: 500,
    },
    { label: "profileRole" },
  );
}
