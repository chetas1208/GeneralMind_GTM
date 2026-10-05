import type { IntelligenceEdgeType, EdgeVerification } from "./types";

const VERIFIED_EVIDENCE = new Set([
  "official_speaker",
  "official_exhibitor",
  "official_sponsor",
  "official_attendee",
  "agenda",
  "company_announcement",
  "person_announcement",
]);

export function evidenceSourceIsVerified(sourceType: string): boolean {
  return VERIFIED_EVIDENCE.has(sourceType);
}

const CONFIRMED_ATTENDANCE = new Set([
  "official_speaker",
  "organizer",
  "public_attendance",
  "exhibitor_employee",
  "sponsor_employee",
  "partner_employee",
]);

/** Person ↔ event edge semantics from attendance enum. */
export function attendanceEdgeType(attendanceType: string): IntelligenceEdgeType {
  switch (attendanceType) {
    case "official_speaker":
      return "speaking_at";
    case "exhibitor_employee":
      return "exhibiting_at";
    case "sponsor_employee":
    case "partner_employee":
      return "sponsoring";
    default:
      return "attending";
  }
}

export function attendanceVerification(attendanceType: string, confidence: number): EdgeVerification {
  if (CONFIRMED_ATTENDANCE.has(attendanceType) && confidence >= 70) return "verified";
  if (attendanceType === "company_participating" || attendanceType === "inferred") return "inferred";
  return confidence >= 85 ? "verified" : "inferred";
}

export function associationVerification(associationType: string, confidence: number): EdgeVerification {
  if (["speaker_company", "exhibitor", "sponsor", "partner", "organizer"].includes(associationType) && confidence >= 60) {
    return confidence >= 80 ? "verified" : "inferred";
  }
  return "inferred";
}

export function associationEdgeType(associationType: string): IntelligenceEdgeType {
  switch (associationType) {
    case "speaker_company":
      return "speaking_at";
    case "exhibitor":
      return "exhibiting_at";
    case "sponsor":
    case "partner":
      return "sponsoring";
    default:
      return "associated_with";
  }
}

export function confidenceStroke(confidence: number | undefined): "solid" | "normal" | "light" | "faint" {
  const c = confidence ?? 50;
  if (c >= 95) return "solid";
  if (c >= 70) return "normal";
  if (c >= 40) return "light";
  return "faint";
}
