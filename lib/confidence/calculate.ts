import { deriveFactors } from "./factors";
import type { ConfidenceBand, ConfidenceClaim, ConfidenceFactors } from "./types";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Transparent weighted sum. LLM output never supplies this number.
 * Weights are ranking inputs, not something the product shows.
 */
export function scoreFactors(factors: ConfidenceFactors): number {
  const supportive =
    factors.sourceAuthority * 0.2 +
    factors.sourceDirectness * 0.22 +
    factors.sourceAgreement * 0.12 +
    factors.recency * 0.1 +
    factors.identityResolution * 0.12 +
    factors.dataCompleteness * 0.08 +
    factors.inferenceDistance * 0.16;
  return clamp01(supportive - factors.contradictionPenalty * 0.55);
}

export function bandFor(score: number, factors: ConfidenceFactors, contradictions: string[]): ConfidenceBand {
  if (contradictions.length > 0 || factors.contradictionPenalty >= 0.5) return "conflicted";
  const directOfficial =
    factors.sourceAuthority >= 0.85 && factors.sourceDirectness >= 0.8 && factors.inferenceDistance >= 0.8;
  if (score >= 0.76 && directOfficial) return "confirmed";
  if (score >= 0.68) return "strong";
  if (score >= 0.46) return "moderate";
  if (score >= 0.26) return "weak";
  return "unverified";
}

export function scoreClaim(claim: ConfidenceClaim, now = Date.now()): { score: number; factors: ConfidenceFactors; contradictions: string[] } {
  const factors = deriveFactors(claim, now);
  const contradictions = [...(claim.contradictions ?? [])].filter(Boolean);
  return { score: scoreFactors(factors), factors, contradictions };
}
