import "server-only";
import type { EvidenceInsertType, AttendanceTypeValue } from "@/lib/db/queries/leads";

/** Split long page text into bounded chunks on paragraph boundaries. */
export function chunkText(text: string, size = 12_000, maxChunks = 3): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > 0 && chunks.length < maxChunks) {
    if (rest.length <= size) {
      chunks.push(rest);
      break;
    }
    let cut = rest.lastIndexOf("\n", size);
    if (cut < size * 0.6) cut = size;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trim();
  }
  return chunks;
}

export const SPEAKER_ROLE = /(speaker|keynote|panel|moderator|presenter|fireside|host|emcee|chair|featured)/i;

export const ATTENDANCE_EVIDENCE_TYPES: ReadonlySet<EvidenceInsertType> = new Set([
  "official_speaker",
  "official_exhibitor",
  "official_sponsor",
  "official_attendee",
  "agenda",
  "company_announcement",
  "person_announcement",
]);

/** Baseline evidence confidence by what the source actually proves. */
export const EVIDENCE_CONFIDENCE: Record<EvidenceInsertType, number> = {
  official_speaker: 95,
  agenda: 90,
  official_attendee: 90,
  person_announcement: 80,
  official_exhibitor: 45,
  official_sponsor: 45,
  company_announcement: 50,
  public_web: 40,
  enrichment: 70,
  inference: 20,
};

export const ATTENDANCE_BY_ASSOCIATION: Record<string, AttendanceTypeValue> = {
  exhibitor: "exhibitor_employee",
  sponsor: "sponsor_employee",
  partner: "partner_employee",
  // Staff of the organising company are not confirmed individually either.
  organizer: "company_participating",
  speaker_company: "company_participating",
  public_attendance: "company_participating",
  unknown: "company_participating",
};

export { namesMatch } from "@/lib/names-match";
