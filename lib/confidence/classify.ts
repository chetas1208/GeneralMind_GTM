import { z } from "zod";
import { bandFor, scoreFactors } from "./calculate";
import { explainAssessment } from "./explain";
import { deriveFactors } from "./factors";
import type { ConfidenceAssessment, ConfidenceClaim, ConfidenceFactors, LlmConfidenceClassification } from "./types";

const clip = z.string().trim().max(400).default("");

/** Classifications only. There is no numeric confidence field for the model to fill in. */
export const llmConfidenceSchema = z.object({
  directness: z.enum(["direct", "indirect", "unknown"]),
  sourceQuality: z.enum(["high", "medium", "low"]),
  agreement: z.enum(["multiple_independent_sources", "single_source", "syndicated", "unknown"]),
  contradictions: z.array(z.string().trim().min(1).max(200)).max(6).default([]),
  missingEvidence: z.array(z.string().trim().min(1).max(200)).max(6).default([]),
  uncertaintySummary: clip,
  whyNow: clip,
  whyGeneralMind: clip,
  discoveryAngle: clip,
  evidenceIds: z.array(z.string().trim().min(1)).max(12).default([]),
});

const TARGETS = {
  directness: { direct: 0.92, indirect: 0.4, unknown: null },
  sourceQuality: { high: 0.9, medium: 0.58, low: 0.3 },
  agreement: { multiple_independent_sources: 0.88, single_source: 0.46, syndicated: 0.22, unknown: null },
} as const;

/** Move a deterministic factor toward the classification, but only a little. */
function nudge(base: number, target: number | null, maxDelta = 0.15): number {
  if (target == null) return base;
  const delta = Math.max(-maxDelta, Math.min(maxDelta, target - base));
  return Math.max(0, Math.min(1, base + delta));
}

export function applyLlmClassification(factors: ConfidenceFactors, llm: LlmConfidenceClassification): ConfidenceFactors {
  return {
    ...factors,
    sourceAuthority: nudge(factors.sourceAuthority, TARGETS.sourceQuality[llm.sourceQuality]),
    sourceDirectness: nudge(factors.sourceDirectness, TARGETS.directness[llm.directness]),
    sourceAgreement: nudge(factors.sourceAgreement, TARGETS.agreement[llm.agreement]),
    dataCompleteness: Math.max(0, factors.dataCompleteness - Math.min(llm.missingEvidence.length, 3) * 0.05),
    contradictionPenalty: llm.contradictions.length > 0 ? Math.max(factors.contradictionPenalty, 0.9) : factors.contradictionPenalty,
  };
}

/** Drop ids the model invented. Narrative with no surviving ids is not high-confidence prose. */
export function acceptEvidenceIds(claimed: string[] | undefined, allowed: Iterable<string>): string[] {
  const ok = new Set(allowed);
  return [...new Set((claimed ?? []).filter((id) => ok.has(id)))];
}

export function assessConfidence(claim: ConfidenceClaim, now = Date.now()): ConfidenceAssessment {
  const baseSources = claim.sourceTypes ?? (claim.attendanceType ? [claim.attendanceType] : []);
  const independent = claim.independentSources ?? (baseSources.length > 0 ? 1 : 0);
  const seeded: ConfidenceClaim = { ...claim, independentSources: independent, sourceTypes: baseSources };
  let factors = (awaitFactors(seeded, now));
  const contradictions = [...(claim.contradictions ?? [])];
  if (claim.llm) {
    factors = applyLlmClassification(factors, claim.llm);
    for (const c of claim.llm.contradictions) contradictions.push(c);
  }
  const uniqueContradictions = [...new Set(contradictions.map((c) => c.trim()).filter(Boolean))];
  if (uniqueContradictions.length > 0) factors = { ...factors, contradictionPenalty: Math.max(factors.contradictionPenalty, 0.9) };
  const internalScore = scoreFactors(factors);
  const band = bandFor(internalScore, factors, uniqueContradictions);
  const narrativeIds = claim.llm ? acceptEvidenceIds(claim.llm.evidenceIds, claim.allowedEvidenceIds ?? []) : [];
  const missing = [...(claim.llm?.missingEvidence ?? [])];
  if (claim.llm && (claim.llm.whyNow || claim.llm.whyGeneralMind) && narrativeIds.length === 0) {
    missing.push("The written rationale is not tied to a stored evidence record.");
  }
  const copy = explainAssessment({
    band,
    attendanceType: claim.attendanceType,
    factors,
    contradictions: uniqueContradictions,
    missing,
    uncertaintySummary: claim.llm?.uncertaintySummary,
    previousBand: claim.previousBand,
  });
  return {
    band,
    ...copy,
    internalScore,
    factors,
    contradictions: uniqueContradictions,
    previousBand: claim.previousBand ?? null,
  };
}

function awaitFactors(claim: ConfidenceClaim, now: number): ConfidenceFactors {
  return deriveFactors(claim, now);
}
