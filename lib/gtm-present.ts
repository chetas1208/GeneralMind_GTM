import { GUESSED_EMAIL_STATUS, isVerifiedEmailStatus } from "@/lib/contact/email-guess";
import { CONFIRMED_ATTENDANCE } from "@/lib/scoring/config";
import { humanize } from "@/lib/format";

export type FieldClarity = "verified" | "unverified" | "manual" | "inferred" | "unknown";

/** Show values with explicit clarity, e.g. `jane@acme.com (unverified)`. */
export function fieldWithClarity(value: string, clarity: FieldClarity): string {
  if (clarity === "verified" || clarity === "unknown") return value;
  if (clarity === "manual") return `${value} (manual)`;
  if (clarity === "inferred") return `${value} (inferred)`;
  return `${value} (unverified)`;
}

export function emailPresentation(
  email: string | null | undefined,
  emailStatus: string | null | undefined,
): { text: string; clarity: FieldClarity } {
  if (!email) return { text: "Not available", clarity: "unknown" };
  if (emailStatus === "manual") return { text: fieldWithClarity(email, "manual"), clarity: "manual" };
  if (emailStatus === GUESSED_EMAIL_STATUS || emailStatus === "guessed" || emailStatus === "unverified") {
    return { text: fieldWithClarity(email, "unverified"), clarity: "unverified" };
  }
  if (isVerifiedEmailStatus(emailStatus)) return { text: email, clarity: "verified" };
  return { text: fieldWithClarity(email, "unverified"), clarity: "unverified" };
}

export function titlePresentation(title: string | null | undefined, source: "event" | "enrichment" | "manual" = "event"): string {
  if (!title) return "Role unknown";
  if (source === "enrichment") return fieldWithClarity(title, "verified");
  if (source === "manual") return fieldWithClarity(title, "manual");
  return fieldWithClarity(title, "inferred");
}

/** User-facing lead status — never expose internal enum names. */
export function leadStatusLabel(status: string): string {
  const map: Record<string, string> = {
    needs_review: "Needs review",
    approved: "Approved",
    rejected: "Rejected",
    hubspot_synced: "Synced",
    failed: "Sync failed",
    discovered: "Discovered",
    qualified: "Qualified",
    enriching: "Enriching",
  };
  return map[status] ?? humanize(status);
}

/** Evidence source types for GTM readers (never vendor names). */
export function evidenceSourceLabel(type: string): string {
  const map: Record<string, string> = {
    official_speaker: "Confirmed speaker",
    official_exhibitor: "Official exhibitor list",
    official_sponsor: "Official sponsor list",
    official_attendee: "Official attendee statement",
    company_announcement: "Company announcement",
    person_announcement: "Personal announcement",
    agenda: "Event agenda",
    public_web: "Public web source",
    enrichment: "Profile verification",
    inference: "Inferred link",
  };
  return map[type] ?? humanize(type);
}

export function evidenceStrength(confidence: number): "High" | "Medium" | "Low" {
  if (confidence >= 80) return "High";
  if (confidence >= 50) return "Medium";
  return "Low";
}

/** Human confidence tier + optional numeric. */
export function confidencePresentation(attendanceType: string, confidence: number): { tier: string; detail: string } {
  const confirmed = CONFIRMED_ATTENDANCE.has(attendanceType as never);
  if (confirmed && confidence >= 90) return { tier: "Confirmed", detail: `${confidence}%` };
  if (confirmed) return { tier: "Strong evidence", detail: `${confidence}%` };
  if (confidence >= 50) return { tier: "Probable", detail: `${confidence}%` };
  if (attendanceType.includes("employee") || attendanceType === "company_participating") {
    return { tier: "Company-associated", detail: `${confidence}%` };
  }
  if (confidence >= 25) return { tier: "Unverified", detail: `${confidence}%` };
  return { tier: "Weak signal", detail: `${confidence}%` };
}

export function signalLabel(attendanceType: string): string {
  const map: Record<string, string> = {
    official_speaker: "Speaker",
    organizer: "Organizer",
    public_attendance: "Stated attendance",
    official_attendee: "Attendee",
    exhibitor_employee: "Exhibitor company",
    sponsor_employee: "Sponsor company",
    partner_employee: "Partner company",
    company_participating: "Participating company",
    inferred: "Indirect signal",
  };
  return map[attendanceType] ?? humanize(attendanceType);
}

export function activityLabel(action: string): string {
  const map: Record<string, string> = {
    approve: "Approved",
    reject: "Rejected",
    edit: "Details updated",
    push_hubspot: "Synced to CRM",
  };
  return map[action] ?? humanize(action);
}

export function signalTypeLabel(type: string): string {
  const map: Record<string, string> = {
    event: "Event",
    hiring: "Hiring",
    job_posting: "Job posting",
    erp_transformation: "ERP",
    executive_change: "Executive change",
    expansion: "Expansion",
    ma: "M&A",
    operational_initiative: "Operations",
    digital_transformation: "Digital",
    procurement_initiative: "Procurement",
    supply_chain_initiative: "Supply chain",
    finance_transformation: "Finance ops",
    automation_initiative: "Automation",
    technology_adoption: "Technology",
    company_announcement: "Announcement",
    funding: "Funding",
  };
  return map[type] ?? humanize(type);
}

export function relevanceTier(score: number | null): string | null {
  if (score == null) return null;
  if (score >= 85) return "Strong fit";
  if (score >= 65) return "Good fit";
  if (score >= 45) return "Moderate";
  return "Weak";
}
