import type { ClaimKind, ConfidenceClaim, ConfidenceFactors } from "./types";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const HIGH_AUTHORITY = new Set([
  "official_speaker",
  "official_attendee",
  "official_exhibitor",
  "official_sponsor",
  "agenda",
  "organizer",
  "company_announcement",
]);

/** Infer a source class from the type we already stored, plus a light URL shape check. */
export function sourceAuthority(sourceTypes: string[], urls: Array<string | null | undefined> = []): number {
  let best = sourceTypes.length === 0 ? 0.1 : 0.28;
  for (const type of sourceTypes) {
    if (HIGH_AUTHORITY.has(type)) best = Math.max(best, 0.94);
    else if (["exhibitor_employee", "sponsor_employee", "partner_employee"].includes(type)) best = Math.max(best, 0.82);
    else if (type === "person_announcement" || type === "public_attendance") best = Math.max(best, 0.74);
    else if (type === "enrichment") best = Math.max(best, 0.68);
    else if (type === "public_web") best = Math.max(best, 0.34);
    else if (type === "inference" || type === "inferred") best = Math.max(best, 0.16);
  }
  for (const url of urls) {
    if (!url) continue;
    const shape = urlShape(url);
    if (shape === "official") best = Math.max(best, 0.9);
    if (shape === "publication") best = Math.max(best, 0.55);
    if (shape === "aggregator") best = Math.min(best, 0.36);
  }
  return best;
}

function urlShape(url: string): "official" | "publication" | "aggregator" | "unknown" {
  let host = "";
  let path = "";
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^www\./, "");
    path = u.pathname.toLowerCase();
  } catch {
    return "unknown";
  }
  if (/(^|\.)((prnewswire|businesswire|globenewswire|einpresswire)\.com)$/.test(host)) return "aggregator";
  if (/\/(speakers?|agenda|exhibitors?|sponsors?|programme|program)\b/.test(path)) return "official";
  if (/(^|\.)((reuters|bloomberg|wsj|ft)\.com)$/.test(host)) return "publication";
  return "unknown";
}

export function directnessFor(attendanceType: string | undefined, sourceTypes: string[]): number {
  const type = attendanceType ?? "";
  if (["official_speaker", "organizer", "official_attendee", "public_attendance", "person_announcement"].includes(type)) return 0.95;
  if (sourceTypes.some((s) => ["official_speaker", "official_attendee", "person_announcement", "agenda"].includes(s))) return 0.9;
  if (["exhibitor_employee", "sponsor_employee", "partner_employee"].includes(type)) return 0.42;
  if (type === "company_participating" || sourceTypes.includes("official_exhibitor") || sourceTypes.includes("official_sponsor")) return 0.3;
  if (type === "inferred" || sourceTypes.includes("inference") || sourceTypes.length === 0) return 0.12;
  return 0.28;
}

export function agreementFor(independentSources: number, syndicated = false): number {
  if (syndicated) return 0.22;
  if (independentSources >= 3) return 0.95;
  if (independentSources === 2) return 0.78;
  if (independentSources === 1) return 0.46;
  return 0.05;
}

const HALF_LIFE_DAYS: Record<ClaimKind, number> = {
  attendance: 120,
  role: 400,
  signal: 60,
  company_news: 180,
};

/** Signal-specific decay. Missing dates stay uncertain rather than fresh. */
export function recencyFor(retrievedAt: string | Date | null | undefined, kind: ClaimKind, now = Date.now()): number {
  if (!retrievedAt) return 0.5;
  const at = retrievedAt instanceof Date ? retrievedAt.getTime() : Date.parse(retrievedAt);
  if (!Number.isFinite(at)) return 0.5;
  const ageDays = Math.max(0, (now - at) / 86_400_000);
  const half = HALF_LIFE_DAYS[kind];
  return clamp01(Math.exp(-ageDays / half));
}

export function identityFor(identity: ConfidenceClaim["identity"]): number {
  const id = identity ?? {};
  let score = id.roleVerified ? 0.92 : 0.78;
  if (id.sameNameAmbiguity) score -= 0.35;
  if (id.companyMismatch) score -= 0.4;
  if (id.titleMismatch) score -= 0.25;
  if (id.locationMismatch) score -= 0.12;
  if (id.weakResolution) score -= 0.32;
  return clamp01(score);
}

export function completenessFor(fields: ConfidenceClaim["completeness"]): number {
  if (!fields) return 0.55;
  const values = [fields.person, fields.title, fields.company, fields.event, fields.source, fields.date];
  const present = values.filter(Boolean).length;
  return clamp01(0.12 + (present / values.length) * 0.88);
}

export function hopsFor(attendanceType: string | undefined, explicit?: number): number {
  if (explicit != null) return explicit;
  const type = attendanceType ?? "inferred";
  if (["official_speaker", "organizer", "public_attendance"].includes(type)) return 0;
  if (["official_attendee", "person_announcement"].includes(type)) return 1;
  if (["exhibitor_employee", "sponsor_employee", "partner_employee"].includes(type)) return 2;
  if (type === "company_participating") return 3;
  return 4;
}

export function inferenceDistanceFor(hops: number): number {
  if (hops <= 0) return 1;
  if (hops === 1) return 0.84;
  if (hops === 2) return 0.48;
  if (hops === 3) return 0.28;
  return 0.12;
}

export function deriveFactors(claim: ConfidenceClaim, now = Date.now()): ConfidenceFactors {
  const sources = claim.sourceTypes ?? (claim.attendanceType ? [claim.attendanceType] : []);
  const hops = hopsFor(claim.attendanceType, claim.hops);
  const contradictions = claim.contradictions?.filter(Boolean) ?? [];
  return {
    sourceAuthority: sourceAuthority(sources, claim.sourceUrls),
    sourceDirectness: directnessFor(claim.attendanceType, sources),
    sourceAgreement: agreementFor(claim.independentSources ?? (sources.length > 0 ? 1 : 0)),
    recency: recencyFor(claim.retrievedAt, claim.kind ?? "attendance", now),
    identityResolution: identityFor(claim.identity),
    dataCompleteness: completenessFor(claim.completeness),
    inferenceDistance: inferenceDistanceFor(hops),
    contradictionPenalty: contradictions.length > 0 ? 0.9 : 0,
  };
}
