import { normalizeUrl } from "@/lib/text";
import type { PlannedQuery, EvidenceCandidate } from "./types";

export function normalizeQueryString(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function dedupePlannedQueries(queries: PlannedQuery[]): PlannedQuery[] {
  const seenNormalized = new Set<string>();
  const out: PlannedQuery[] = [];

  for (const q of queries) {
    const norm = normalizeQueryString(q.query);
    if (!norm || seenNormalized.has(norm)) continue;
    seenNormalized.add(norm);
    out.push(q);
  }

  return out;
}

export function dedupeEvidenceCandidates(candidates: EvidenceCandidate[]): EvidenceCandidate[] {
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const out: EvidenceCandidate[] = [];

  for (const c of candidates) {
    const cleanUrl = normalizeUrl(c.url) || c.url.toLowerCase();
    const cleanTitle = c.title.toLowerCase().trim().slice(0, 60);

    if (seenUrls.has(cleanUrl)) continue;
    if (cleanTitle.length > 10 && seenTitles.has(cleanTitle)) continue;

    seenUrls.add(cleanUrl);
    if (cleanTitle.length > 10) seenTitles.add(cleanTitle);

    out.push(c);
  }

  return out;
}
