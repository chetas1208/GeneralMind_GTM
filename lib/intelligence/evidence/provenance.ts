import { ATTENDANCE_LABEL } from "@/lib/icp/config";
import type { AttendanceKind } from "@/lib/icp/types";

export type ProvenanceStep = { label: string; detail?: string };

/** Compact provenance path for UI — not a force-directed graph. */
export function buildProvenancePath(input: {
  personName: string;
  personTitle: string | null;
  companyName: string | null;
  eventName: string;
  attendanceType: string;
  strongestEvidenceLabel?: string | null;
}): ProvenanceStep[] {
  const steps: ProvenanceStep[] = [
    { label: input.personName, detail: input.personTitle ?? undefined },
  ];
  if (input.companyName) steps.push({ label: input.companyName, detail: "Employer" });
  steps.push({
    label: input.eventName,
    detail: ATTENDANCE_LABEL[input.attendanceType as AttendanceKind] ?? input.attendanceType,
  });
  if (input.strongestEvidenceLabel) steps.push({ label: input.strongestEvidenceLabel, detail: "Source" });
  return steps;
}
