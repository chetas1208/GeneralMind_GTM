import "server-only";
import { AiValidationError } from "@/lib/ai/provider";
import { explainQualification } from "@/lib/ai/tasks";
import { mapSettled } from "@/lib/concurrency";
import type { EventRow } from "@/lib/db/queries/events";
import { listEvidenceForLeads, listEventLeadRows, updateLead } from "@/lib/db/queries/leads";
import { updateCompany } from "@/lib/db/queries/companies";
import type { QualificationDetailJson } from "@/lib/db/schema";
import { isNegativePersona, inferOpportunityHypothesis } from "@/lib/icp";
import { ATTENDANCE_LABEL, CONFIRMED_ATTENDANCE, LEAD_QUALIFY_THRESHOLD } from "@/lib/scoring/config";
import { isVerifiedEmailStatus } from "@/lib/contact/email-guess";
import { assessConfidence } from "@/lib/confidence";
import type { ConfidenceAssessmentJson } from "@/lib/db/schema";
import type { ConfidenceBand } from "@/lib/confidence";
import { computeLeadPriority } from "@/lib/intelligence/ranking/lead-priority";
import { countPersonLeadFrequency } from "@/lib/db/queries/leads";
import type { RunContext } from "../context";
import { computeLeadScore, deterministicReason } from "../scoring";

const PROTECTED = new Set(["approved", "rejected", "hubspot_synced"]);
const EXPLAIN_PER_STEP = 3;
const MAX_EXPLAIN = 30;

/** Stage F: deterministic scoring. No model involved. */
export async function runScoreStage(ctx: RunContext, event: EventRow): Promise<boolean> {
  ctx.setStage("scoring");
  const rows = await listEventLeadRows(event.id);
  const evidence = await listEvidenceForLeads(rows.map((r) => r.lead.id));
  let qualified = 0;
  const totals = new Map<string, number>();

  for (const r of rows) {
    if (PROTECTED.has(r.lead.status)) continue; // never overwrite human decisions
    const ev = evidence.get(r.lead.id) ?? [];
    const score = computeLeadScore({ lead: r.lead, person: r.person, company: r.company, evidence: ev, event });
    totals.set(r.lead.id, score.total);
    const irrelevant = isNegativePersona(r.person.title);
    const status =
      irrelevant || score.total < LEAD_QUALIFY_THRESHOLD
        ? "discovered"
        : score.attendanceConfidence < 25 && score.intent.total <= 8
          ? "discovered"
          : "needs_review";
    if (status === "needs_review") qualified++;

    const signalFrequency = await countPersonLeadFrequency(r.person.id);
    const priorityScore = computeLeadPriority({
      totalScore: score.total,
      attendanceType: r.lead.attendanceType,
      attendanceConfidence: score.attendanceConfidence,
      eventStartDate: event.startDate,
      hasVerifiedWorkEmail: Boolean(r.person.email) && isVerifiedEmailStatus(r.person.emailStatus),
      hasGuessedWorkEmail: Boolean(r.person.email) && !isVerifiedEmailStatus(r.person.emailStatus),
      hasVerifiedProfile: Boolean(r.person.linkedinUrl),
      signalFrequency,
      reviewStatus: status,
    });
    const opportunityHypothesis = inferOpportunityHypothesis({
      persona: (r.person.persona as import("@/lib/icp/types").Persona | null) ?? null,
      operationalSignals: r.company?.operationalSignals ?? [],
      erpSignals: r.company?.erpSignals ?? [],
      description: r.company?.description,
      attendanceConfirmed: CONFIRMED_ATTENDANCE.has(r.lead.attendanceType),
    });

    const previousBand = (r.lead.confidenceAssessment?.band ?? null) as ConfidenceBand | null;
    const assessment = assessConfidence({
      kind: "attendance",
      attendanceType: r.lead.attendanceType,
      sourceTypes: ev.map((e) => e.sourceType),
      sourceUrls: ev.map((e) => e.sourceUrl),
      independentSources: new Set(ev.map((e) => e.sourceType)).size,
      retrievedAt: ev[0]?.retrievedAt ?? null,
      identity: { roleVerified: Boolean(r.person.enrichedAt), titleMismatch: Boolean(r.lead.qualityFlags?.titleMismatch) },
      completeness: {
        person: Boolean(r.person.fullName),
        title: Boolean(r.person.title),
        company: Boolean(r.company?.name),
        event: Boolean(event.name),
        source: ev.length > 0,
        date: Boolean(event.startDate),
      },
      contradictions: r.lead.qualityFlags?.titleMismatch ? ["The event title and the verified profile do not match."] : [],
      previousBand,
      allowedEvidenceIds: ev.map((e) => e.id),
    });
    const confidenceAssessment: ConfidenceAssessmentJson = {
      band: assessment.band,
      label: assessment.label,
      summary: assessment.summary,
      why: assessment.why,
      uncertainty: assessment.uncertainty,
      internalScore: assessment.internalScore,
      contradictions: assessment.contradictions,
      previousBand: previousBand && previousBand !== assessment.band ? previousBand : null,
      changeReason: previousBand && previousBand !== assessment.band ? assessment.changeReason : null,
      assessedAt: new Date().toISOString(),
      narrative: r.lead.confidenceAssessment?.narrative,
    };

    await updateLead(r.lead.id, {
      companyFitScore: score.company.total,
      personaFitScore: score.persona.total,
      intentScore: score.intent.total,
      totalScore: score.total,
      priorityScore,
      signalFrequency,
      opportunityHypothesis,
      qualityFlags: irrelevant ? { irrelevantPersona: true } : undefined,
      lastVerifiedAt: new Date(),
      attendanceConfidence: score.attendanceConfidence,
      scoreBreakdown: score.breakdown,
      qualificationReason: deterministicReason({ person: r.person, company: r.company, event, lead: r.lead, score }),
      confidenceAssessment,
      status,
    });
    if (r.company && r.company.companyFitScore !== score.company.total && r.company.enrichedAt) {
      await updateCompany(r.company.id, { companyFitScore: score.company.total });
    }
  }
  ctx.counts.leadsQualified = qualified;
  ctx.counts.peopleFound = rows.length;
  ctx.cursor.explainQueue = rows
    .filter((r) => !PROTECTED.has(r.lead.status) && (totals.get(r.lead.id) ?? 0) >= LEAD_QUALIFY_THRESHOLD)
    .sort((a, b) => (totals.get(b.lead.id) ?? 0) - (totals.get(a.lead.id) ?? 0))
    .slice(0, MAX_EXPLAIN)
    .map((r) => r.lead.id);
  ctx.cursor.explainDone = 0;
  ctx.note(`Scored ${rows.length} leads deterministically · ${qualified} at or above the review threshold (${LEAD_QUALIFY_THRESHOLD}/100)`);
  const { refreshMetricSnapshots } = await import("@/lib/analytics/snapshots");
  await refreshMetricSnapshots().catch(() => undefined);
  return true;
}

const CLAIMS_ATTENDANCE = /\b(is attending|will be attending|will attend|attends|is speaking|confirmed (attendee|attendance)|is confirmed)\b/i;
const HEDGED = /\b(not (been )?confirmed|unconfirmed|cannot confirm|no confirmation|not verified|isn't confirmed|is not confirmed)\b/i;

/** Stage G: Nemotron explains the (already fixed) score. It can never change score or evidence. */
export async function runExplainStage(ctx: RunContext, event: EventRow): Promise<boolean> {
  ctx.setStage("synthesizing");
  const c = ctx.cursor;
  const queue = c.explainQueue ?? [];
  const start = c.explainDone ?? 0;
  const batch = queue.slice(start, start + EXPLAIN_PER_STEP);
  if (batch.length === 0) return true;

  const rows = await listEventLeadRows(event.id);
  const evidence = await listEvidenceForLeads(batch);

  const outcomes = await mapSettled(batch, EXPLAIN_PER_STEP, async (leadId) => {
    const r = rows.find((x) => x.lead.id === leadId);
    if (!r) return null;
    const ev = evidence.get(leadId) ?? [];
    const score = computeLeadScore({ lead: r.lead, person: r.person, company: r.company, evidence: ev, event });
    const confirmed = CONFIRMED_ATTENDANCE.has(r.lead.attendanceType);
    const detail = await explainQualification({
      person: { name: r.person.fullName, title: r.person.title },
      company: { name: r.company?.name ?? "Unknown", industry: r.company?.industry ?? null, employeeCount: r.company?.employeeCount ?? null },
      event: { name: event.name, startDate: event.startDate },
      attendanceType: r.lead.attendanceType,
      attendanceConfidence: score.attendanceConfidence,
      score: { company: score.company.total, persona: score.persona.total, intent: score.intent.total, total: score.total },
      scoreFactors: [...score.company.factors, ...score.persona.factors, ...score.intent.factors].map((f) => ({ label: f.label, points: f.points, max: f.max, note: f.note })),
      evidence: ev.slice(0, 8).map((e) => ({ type: e.sourceType, text: e.evidenceText, url: e.sourceUrl })),
      emailKnown: Boolean(r.person.email),
    });

    // Guard: a model may not assert attendance that the evidence does not support.
    const guarded: QualificationDetailJson = { ...detail };
    if (!confirmed) {
      const text = `${detail.eventLink} ${detail.whyPersonMatters}`;
      if (CLAIMS_ATTENDANCE.test(text) && !HEDGED.test(text)) {
        guarded.eventLink = `${ATTENDANCE_LABEL[r.lead.attendanceType]}. ${r.person.fullName}'s own attendance is not confirmed by the evidence on file.`;
      }
      if (!HEDGED.test(guarded.uncertainty)) guarded.uncertainty = `${guarded.uncertainty} Personal attendance is not confirmed.`.trim();
    }
    const { classifyEvidence } = await import("@/lib/confidence/synthesize");
    let confidenceAssessment = r.lead.confidenceAssessment ?? undefined;
    try {
      const classified = await classifyEvidence({
        person: r.person.fullName,
        title: r.person.title,
        company: r.company?.name,
        event: event.name,
        attendanceType: r.lead.attendanceType,
        evidence: ev.slice(0, 8).map((e) => ({ id: e.id, type: e.sourceType, text: e.evidenceText })),
      });
      const assessed = assessConfidence({
        kind: "attendance",
        attendanceType: r.lead.attendanceType,
        sourceTypes: ev.map((e) => e.sourceType),
        independentSources: new Set(ev.map((e) => e.sourceType)).size,
        retrievedAt: ev[0]?.retrievedAt ?? null,
        identity: { roleVerified: Boolean(r.person.enrichedAt) },
        allowedEvidenceIds: ev.map((e) => e.id),
        previousBand: (r.lead.confidenceAssessment?.band ?? null) as ConfidenceBand | null,
        llm: classified,
      });
      confidenceAssessment = {
        band: assessed.band,
        label: assessed.label,
        summary: assessed.summary,
        why: assessed.why,
        uncertainty: assessed.uncertainty,
        internalScore: assessed.internalScore,
        contradictions: assessed.contradictions,
        previousBand: r.lead.confidenceAssessment?.band && r.lead.confidenceAssessment.band !== assessed.band ? r.lead.confidenceAssessment.band : null,
        changeReason: r.lead.confidenceAssessment?.band && r.lead.confidenceAssessment.band !== assessed.band ? assessed.changeReason : null,
        assessedAt: new Date().toISOString(),
        narrative: classified.evidenceIds.length
          ? {
              whyNow: classified.whyNow,
              whyGeneralMind: classified.whyGeneralMind,
              discoveryAngle: classified.discoveryAngle,
              evidenceIds: classified.evidenceIds,
            }
          : undefined,
      };
    } catch {
      /* classification is an input, not a requirement */
    }
    await updateLead(leadId, { qualificationDetail: guarded, confidenceAssessment, aiStatus: "done", aiError: null });
    return `Explained ${r.person.fullName}`;
  });

  outcomes.forEach((o, i) => {
    if (!o.ok) {
      const message = o.error instanceof AiValidationError ? `Validation failed after repair: ${o.error.message}` : o.error instanceof Error ? o.error.message : String(o.error);
      ctx.counters.aiFailures = (ctx.counters.aiFailures ?? 0) + 1;
      ctx.note(`Explanation failed for lead ${batch[i].slice(0, 8)} (source data retained): ${message.slice(0, 180)}`, "warn");
    }
  });
  // Persist failures explicitly (kept out of the forEach to await properly).
  for (let i = 0; i < outcomes.length; i++) {
    const o = outcomes[i];
    if (!o.ok) {
      const message = o.error instanceof Error ? o.error.message : String(o.error);
      await updateLead(batch[i], { aiStatus: "failed", aiError: message.slice(0, 500) });
    }
  }
  c.explainDone = start + batch.length;
  return (c.explainDone ?? 0) >= queue.length;
}
