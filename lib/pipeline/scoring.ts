import "server-only";
import type { CompanyRow } from "@/lib/db/queries/companies";
import type { EventRow } from "@/lib/db/queries/events";
import type { EvidenceRow, LeadRow } from "@/lib/db/queries/leads";
import type { PersonRow } from "@/lib/db/queries/people";
import type { ScoreBreakdownJson } from "@/lib/db/schema";
import { ATTENDANCE_LABEL } from "@/lib/scoring/config";
import { scoreLead, type LeadScore } from "@/lib/scoring/total-score";
import type { Persona, Seniority } from "@/lib/scoring/types";
import { ATTENDANCE_EVIDENCE_TYPES } from "./stages/shared";

export type ScoredLead = LeadScore & { independentSources: number; breakdown: ScoreBreakdownJson };

/** Distinct source URLs whose evidence type actually bears on attendance. */
export function independentAttendanceSources(evidence: EvidenceRow[]): number {
  const urls = new Set<string>();
  for (const e of evidence) {
    if (ATTENDANCE_EVIDENCE_TYPES.has(e.sourceType) && e.sourceUrl) urls.add(e.sourceUrl.replace(/[#?].*$/, ""));
  }
  return Math.max(urls.size, evidence.some((e) => ATTENDANCE_EVIDENCE_TYPES.has(e.sourceType)) ? 1 : 0);
}

export function computeLeadScore(args: {
  lead: Pick<LeadRow, "attendanceType">;
  person: PersonRow;
  company: CompanyRow | null;
  evidence: EvidenceRow[];
  event: Pick<EventRow, "relevanceScore">;
}): ScoredLead {
  const { lead, person, company, evidence, event } = args;
  const independentSources = independentAttendanceSources(evidence);
  const technologies = [...(company?.erpSignals ?? [])];
  const score = scoreLead({
    company: {
      industry: company?.industry,
      description: company?.description,
      keywords: company?.operationalSignals ?? [],
      employeeCount: company?.employeeCount,
      country: company?.country,
      technologies,
    },
    persona: {
      title: person.title,
      personaOverride: (person.persona as Persona | null) ?? null,
      seniorityOverride: (person.seniority as Seniority | null) ?? null,
    },
    intent: { attendanceType: lead.attendanceType, independentSources, eventRelevance: event.relevanceScore },
    enrichmentConfirmsRole: evidence.some((e) => e.sourceType === "enrichment" && /confirms/i.test(e.evidenceText)),
  });
  return {
    ...score,
    independentSources,
    breakdown: {
      company: score.company,
      persona: score.persona,
      intent: score.intent,
      total: score.total,
      version: score.version,
    },
  };
}

/** Always-available, model-free summary so the review queue is never blank. */
export function deterministicReason(args: { person: PersonRow; company: CompanyRow | null; event: Pick<EventRow, "name">; lead: Pick<LeadRow, "attendanceType">; score: ScoredLead }): string {
  const { person, company, event, lead, score } = args;
  return `${person.fullName}${person.title ? `, ${person.title}` : ""}${company ? ` at ${company.name}` : ""} — ${ATTENDANCE_LABEL[lead.attendanceType]} for ${event.name}. Score ${score.total}/100 = company fit ${score.company.total}/${score.company.max} + persona fit ${score.persona.total}/${score.persona.max} + event signal ${score.intent.total}/${score.intent.max}.`;
}
