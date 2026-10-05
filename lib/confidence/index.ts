export { assessConfidence, acceptEvidenceIds, applyLlmClassification, llmConfidenceSchema } from "./classify";
export { fitBand, relevanceBand } from "./explain";
export { BAND_LABEL } from "./types";
export type {
  ConfidenceAssessment,
  ConfidenceBand,
  ConfidenceClaim,
  ConfidenceFactors,
  FitBand,
  LlmConfidenceClassification,
} from "./types";

import { assessConfidence } from "./classify";
import type { ConfidenceClaim } from "./types";

/** Attendance row → band, using the relationship type rather than the stored percentage. */
export function assessAttendance(input: {
  attendanceType: string;
  independentSources?: number;
  contradictions?: string[];
  retrievedAt?: string | Date | null;
  roleVerified?: boolean;
}): ReturnType<typeof assessConfidence> {
  const claim: ConfidenceClaim = {
    kind: "attendance",
    attendanceType: input.attendanceType,
    sourceTypes: [input.attendanceType],
    independentSources: input.independentSources,
    contradictions: input.contradictions,
    retrievedAt: input.retrievedAt,
    identity: input.roleVerified ? { roleVerified: true } : undefined,
  };
  return assessConfidence(claim);
}
