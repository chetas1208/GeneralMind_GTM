import type { SignalCandidate } from "./types";

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * True when the host *looks* like the company (contains its name) but is not the company's own domain —
 * e.g. `tvhconsulting.com` for company "TVH" (domain `tvh.com`). Such pages describe a different entity.
 */
export function isLookalikeSource(url: string, companyName: string, companyDomain?: string | null): boolean {
  const host = hostOf(url);
  if (!host) return true;
  const own = companyDomain?.toLowerCase().replace(/^www\./, "");
  if (own && (host === own || host.endsWith(`.${own}`))) return false;
  const name = compact(companyName);
  if (name.length < 3) return false;
  const labels = host.split(".");
  const registrable = labels.length >= 2 ? labels[labels.length - 2] : labels[0];
  // Exact brand label on another TLD (tvh.be vs tvh.com) is still the brand; "tvhconsulting" is not.
  if (registrable === name) return false;
  return registrable.includes(name);
}

/** Whole-word, case-insensitive company mentions (so "TVH" does not match inside "ATVHub"). */
export function companyMentions(text: string, companyName: string): number[] {
  const re = new RegExp(`(?<![A-Za-z0-9])${escapeRe(companyName)}(?![A-Za-z0-9])`, "gi");
  const hits: number[] = [];
  for (let m = re.exec(text); m; m = re.exec(text)) hits.push(m.index);
  return hits;
}

/**
 * The claim must be about THIS company: a needle must appear within `window` characters of a whole-word
 * company mention. Prevents "company X is mentioned on a page that is about SAP" from becoming a signal.
 */
export function verifyNearCompany(candidate: SignalCandidate, needles: RegExp[], companyName: string, window = 350): boolean {
  const text = String(candidate.metadata?.fullTextForVerification ?? `${candidate.evidenceText ?? ""} ${candidate.summary}`);
  const mentions = companyMentions(`${candidate.title} ${text}`, companyName);
  if (!mentions.length) return false;
  const haystack = `${candidate.title} ${text}`;
  return needles.some((re) => {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    for (let m = g.exec(haystack); m; m = g.exec(haystack)) {
      if (mentions.some((i) => Math.abs(i - m.index) <= window)) return true;
    }
    return false;
  });
}

const ROLE_WORDS = /\b(director|manager|lead|analyst|specialist|engineer|head|officer|vp|vice president|architect|coordinator|buyer|planner|controller|supervisor)\b/i;

/** A real job posting names a role; "Supply Chain Careers" is a landing page. */
export function looksLikeSpecificRole(title: string): boolean {
  return ROLE_WORDS.test(title);
}

/** Seniority/strategic weight of a role title → how relevant the hiring signal is. Needs a GeneralMind-relevant function in the TITLE. */
export function roleRelevance(title: string): number {
  const functional = /\b(procurement|sourcing|purchasing|supply chain|order (management|to cash)|payables?|receivables?|shared services|SAP|ERP|finance transformation|logistics|S\/4)/i.test(title);
  const senior = /\b(transformation|program(me)? (director|manager|lead)|head of|vp|vice president|chief|director)\b/i.test(title);
  const mid = /\b(lead|senior|principal|architect|manager)\b/i.test(title);
  if (senior && functional) return 90;
  if ((senior || mid) && functional) return 72;
  if (senior) return 58; // senior but function not clearly in scope
  return 52; // analyst / coordinator level: weak evidence of organisational investment
}

/** Strip the verification payload before persisting so only the cited evidence snippet is stored. */
export function withoutVerificationPayload<T extends SignalCandidate>(c: T): T {
  if (!c.metadata) return c;
  const { fullTextForVerification: _ignored, ...rest } = c.metadata;
  void _ignored;
  return { ...c, metadata: rest };
}

/** Personal profiles and social posts are not announcements by or about a company. */
export function isLowQualitySource(url: string): boolean {
  const host = hostOf(url);
  if (!host) return true;
  if (/(^|\.)linkedin\.com$/.test(host)) return !/\/company\//.test(url) || /\/posts?\//.test(url);
  return /(^|\.)(facebook|twitter|x|instagram|tiktok|youtube|reddit|quora|glassdoor)\.com$/.test(host);
}

/** Webinars, e-books and certification pages are marketing content, not evidence of an initiative. */
export function isMarketingContent(title: string): boolean {
  return /\b(webinar|on-demand|register now|e-?book|white ?paper|podcast|certification|course|training program|masterclass)\b/i.test(title);
}

export function isOwnDomain(url: string, companyDomain?: string | null): boolean {
  const host = hostOf(url);
  const own = companyDomain?.toLowerCase().replace(/^www\./, "");
  return Boolean(host && own && (host === own || host.endsWith(`.${own}`)));
}

/** Primary sources (the company's own site) outrank third-party coverage. */
export function tieredConfidence(candidate: SignalCandidate, base: number): number {
  const primary = candidate.metadata?.primarySource === true;
  return Math.max(30, Math.min(99, base + (primary ? 8 : -8)));
}
