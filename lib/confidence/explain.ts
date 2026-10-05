import { BAND_LABEL } from "./types";
import type { ConfidenceAssessment, ConfidenceBand, ConfidenceFactors } from "./types";

export function explainAssessment(input: {
  band: ConfidenceBand;
  attendanceType?: string;
  factors: ConfidenceFactors;
  contradictions: string[];
  missing?: string[];
  uncertaintySummary?: string;
  previousBand?: ConfidenceBand | null;
}): Pick<ConfidenceAssessment, "label" | "summary" | "why" | "uncertainty" | "changeReason"> {
  const why: string[] = [];
  if (input.factors.sourceAuthority >= 0.85) why.push("Official or first-party source");
  else if (input.factors.sourceAuthority >= 0.6) why.push("Reputable source, not the event's own page");
  else if (input.factors.sourceAuthority > 0.2) why.push("Secondary or aggregated source");

  if (input.factors.sourceDirectness >= 0.8) why.push("The person is named in the evidence");
  else if (input.factors.sourceDirectness >= 0.4) why.push("Company participation is confirmed; the person is inferred");
  else why.push("The link to this person is indirect");

  if (input.factors.sourceAgreement >= 0.75) why.push("Independent sources agree");
  if (input.factors.identityResolution >= 0.85) why.push("Current role lines up with the record");
  if (input.factors.recency < 0.35) why.push("The supporting record is getting old");

  const uncertainty: string[] = [];
  if (input.factors.inferenceDistance < 0.7) uncertainty.push("Personal attendance is not directly confirmed");
  if (input.factors.identityResolution < 0.6) uncertainty.push("The person match is ambiguous or incomplete");
  if (input.factors.dataCompleteness < 0.45) uncertainty.push("Role, company, or source context is missing");
  if (input.factors.recency < 0.35) uncertainty.push("This has not been rechecked recently");
  for (const m of input.missing ?? []) uncertainty.push(m);
  if (input.uncertaintySummary) uncertainty.push(input.uncertaintySummary);
  for (const c of input.contradictions) uncertainty.push(c);

  const summary = summaryFor(input.band, input.attendanceType, input.contradictions[0]);
  const changeReason =
    input.previousBand && input.previousBand !== input.band
      ? `${BAND_LABEL[input.previousBand]} → ${BAND_LABEL[input.band]}. ${summary}`
      : null;

  return { label: BAND_LABEL[input.band], summary, why: why.slice(0, 4), uncertainty: unique(uncertainty).slice(0, 5), changeReason };
}

function summaryFor(band: ConfidenceBand, attendanceType?: string, contradiction?: string): string {
  if (band === "conflicted") return contradiction ?? "Credible sources disagree, so this should not be treated as settled.";
  if (attendanceType === "official_speaker" && band === "confirmed") return "Official event speaker page names this person.";
  if (attendanceType === "organizer" && (band === "confirmed" || band === "strong")) return "Listed with the organizing side of the event.";
  if (attendanceType === "public_attendance") return "The person or their company said they are attending. Treat a single announcement as strong, not settled, until another independent source agrees.";
  if (attendanceType === "exhibitor_employee" || attendanceType === "sponsor_employee" || attendanceType === "partner_employee") {
    return "The company is on the event list. This person's own attendance is not verified.";
  }
  if (attendanceType === "company_participating") return "The company is mentioned around the event. That is not evidence this person is going.";
  if (band === "confirmed") return "Direct evidence from a high-authority source names this relationship.";
  if (band === "strong") return "Good evidence, with a remaining gap you should know about.";
  if (band === "moderate") return "Useful evidence, but an inference is still doing some of the work.";
  if (band === "weak") return "Limited or secondary evidence. Do not treat this as attendance.";
  return "Not enough evidence to support the claim.";
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function fitBand(score: number, max: number): "Excellent" | "Strong" | "Moderate" | "Weak" {
  if (max <= 0) return "Weak";
  const n = score / max;
  if (n >= 0.85) return "Excellent";
  if (n >= 0.65) return "Strong";
  if (n >= 0.4) return "Moderate";
  return "Weak";
}

export function relevanceBand(score: number | null | undefined): "Excellent" | "Strong" | "Moderate" | "Weak" | null {
  if (score == null) return null;
  return fitBand(score, 100);
}
