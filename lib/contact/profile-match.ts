import { namesMatch } from "@/lib/names-match";
import { findSnippet } from "@/lib/text";

/**
 * Pure verification rules for the public-web contact route.
 *
 * Without a paid people-data provider, the only contact route we can offer is a public profile
 * URL. It is attached ONLY when every check below passes; we never guess a URL or an email.
 */

const stripAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Jörg / Joerg / Jorg all compare equal; so do Müller / Mueller / Muller. */
function foldGerman(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([aou])e/g, "$1");
}

function nameTokens(name: string): string[] {
  return foldGerman(name)
    .split(",")[0] // drop credentials: "Jane Doe, MBA"
    .replace(/\b(dr|prof|mr|mrs|ms|mba|phd|cpim|cscp)\b\.?/g, " ")
    .replace(/[^a-z\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Known short forms only. A bare prefix rule would equate Jane/Janet or Ann/Anna and attach the
 * wrong person's profile; a false rejection is far cheaper than a false match.
 */
const NICKNAMES: Record<string, string> = {
  chris: "christopher", mike: "michael", bob: "robert", rob: "robert", bill: "william", will: "william",
  jim: "james", jimmy: "james", tom: "thomas", dave: "david", steve: "steven", matt: "matthew",
  tony: "anthony", dan: "daniel", joe: "joseph", ben: "benjamin", nick: "nicholas", alex: "alexander",
  andy: "andrew", drew: "andrew", kate: "katherine", katie: "katherine", liz: "elizabeth", beth: "elizabeth",
  jen: "jennifer", jenny: "jennifer", sue: "susan", pat: "patricia", greg: "gregory", jeff: "jeffrey",
  ken: "kenneth", ron: "ronald", don: "donald", ed: "edward", ted: "edward", rick: "richard", dick: "richard",
  rich: "richard", sam: "samuel", pete: "peter", phil: "philip", tim: "timothy", zach: "zachary", jon: "jonathan",
};
const canonicalFirst = (n: string) => NICKNAMES[n] ?? n;

/** Same person: exact last name, known nickname, or abbreviated surname ("Caitlin V." ↔ "Caitlin Vorlicek"). */
export function personNamesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (x.length < 2 || y.length < 2) return false;
  const [fx, lx] = [x[0], x[x.length - 1]];
  const [fy, ly] = [y[0], y[y.length - 1]];
  if (canonicalFirst(fx) !== canonicalFirst(fy)) return false;
  if (lx === ly) return true;
  const abbrev = (fullLast: string, shortLast: string) => shortLast.length === 1 && fullLast.startsWith(shortLast);
  return abbrev(lx, ly) || abbrev(ly, lx);
}

/** Alternate employer strings extracted from firmographics (parenthetical legal names, domain stem, …). */
export function companySearchAliases(name: string, opts: { description?: string | null; domain?: string | null } = {}): string[] {
  const out = new Set<string>([name.trim()]);
  const desc = opts.description ?? "";
  const stem = opts.domain?.split(".")[0]?.trim();
  if (stem && stem.length >= 2) out.add(stem);
  for (const m of desc.matchAll(/\(([^)]+)\)/g)) {
    for (const part of m[1].split(/[,;]/)) {
      const p = part.trim();
      if (p.length >= 2 && p.length < 80) out.add(p);
    }
  }
  return [...out];
}

export function mentionsAnyCompany(pageText: string, aliases: string[]): boolean {
  return aliases.some((a) => mentionsCompany(pageText, a));
}

export function companyNamesMatch(label: string, aliases: string[]): boolean {
  return aliases.some((a) => namesMatch(label, a));
}

/** A personal profile page (`/in/<slug>`), never a company page, post or search result. */
export function isLinkedinProfileUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /(^|\.)linkedin\.com$/i.test(u.hostname) && /^\/in\/[^/]+\/?$/i.test(u.pathname);
  } catch {
    return false;
  }
}

export type ProfileRoleLike = {
  fullName: string | null;
  isCurrent: boolean;
  currentTitle: string | null;
  currentCompany: string | null;
  quote: string | null;
};

export type ProfileVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Decide whether an extracted public profile is the person we are looking for.
 * Every check is deterministic; the LLM only extracts text, it never makes the decision.
 */
export function verifyProfile(args: {
  expected: { fullName: string; companyAliases: string[] };
  role: ProfileRoleLike;
  pageText: string;
  pageTitle?: string | null;
}): ProfileVerdict {
  const { expected, role, pageText, pageTitle } = args;
  if (!role.isCurrent || !role.currentTitle || !role.currentCompany) return { ok: false, reason: "no current role stated" };
  if (!role.quote || !findSnippet(pageText, role.quote.slice(0, 120), 10)) return { ok: false, reason: "role quote not found on the page" };
  const profileName = role.fullName ?? (pageTitle ?? "").replace(/\s*[|–-]\s*LinkedIn.*$/i, "");
  if (!personNamesMatch(expected.fullName, profileName)) return { ok: false, reason: "name does not match" };
  if (!companyNamesMatch(role.currentCompany, expected.companyAliases)) return { ok: false, reason: "current company does not match" };
  if (!mentionsAnyCompany(role.quote, expected.companyAliases)) return { ok: false, reason: "quoted text does not name the employer" };
  return { ok: true };
}

const COMPANY_SUFFIX = /\b(incorporated|inc|llc|ltd|limited|corp|corporation|co|company|gmbh|ag|sa|plc|holdings|group|the)\b/g;
const compactCompany = (s: string) =>
  stripAccents(s).toLowerCase().replace(/&/g, " and ").replace(COMPANY_SUFFIX, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Cheap pre-check: the page names the employer as whole words (so we never send namesakes to the LLM). */
export function mentionsCompany(pageText: string, companyName: string): boolean {
  const c = compactCompany(companyName);
  if (c.length < 3) return false;
  return ` ${compactCompany(pageText)} `.includes(` ${c} `);
}

/** Search-result titles for profiles read "Jane Smith", or "Jane Smith - VP Supply Chain - Acme | LinkedIn". */
export function nameFromProfileTitle(title: string | null | undefined): string {
  return (title ?? "").split(/\s[|–—-]\s/)[0].trim();
}

/** Deterministic gate that decides whether a search hit is even worth an LLM read. */
export function worthReading(args: {
  expected: { fullName: string; companyAliases: string[] };
  title?: string | null;
  pageText: string;
}): boolean {
  const header = profileHeader(args.pageText).name;
  const nameOk =
    personNamesMatch(args.expected.fullName, nameFromProfileTitle(args.title)) ||
    (header ? personNamesMatch(args.expected.fullName, header) : false);
  return nameOk && mentionsAnyCompany(args.pageText, args.expected.companyAliases);
}

/** Every name the page gives for the person (search-result title and on-page header) must match. */
function profileNameOk(expected: string, pageTitle: string | null | undefined, headerName: string | null): boolean {
  const seen = [nameFromProfileTitle(pageTitle), headerName ?? ""].filter((n) => n.trim().length > 0);
  return seen.length > 0 && seen.every((n) => personNamesMatch(expected, n));
}

const FORMER = /\b(former|formerly|previously|retired|alumnus|alumna|alumni)\b|\bex[-\s]/i;

/** `[Sanofi](https://…)` → `Sanofi`, so stored evidence reads as plain text. */
const plainText = (s: string) => s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

/** The profile header block: everything before the first "## " section (capped), e.g. name + headline + location. */
export function profileHeader(pageText: string): { name: string | null; headline: string } {
  const text = pageText.replace(/\r/g, "").trim();
  const cut = text.search(/\n##\s/);
  const block = (cut > 0 ? text.slice(0, cut) : text).slice(0, 700);
  const lines = block.split("\n").map((l) => l.replace(/^#+\s*/, "").trim()).filter(Boolean);
  return { name: lines[0] ?? null, headline: lines.slice(1, 3).map(plainText).join(" · ").slice(0, 300) };
}

/**
 * Deterministic acceptance with no LLM: the person's own headline names their current employer.
 * Returns the headline text taken from the page so the evidence quotes the source, not a model.
 */
export function verifyByHeadline(args: {
  expected: { fullName: string; companyAliases: string[] };
  pageText: string;
  pageTitle?: string | null;
}): { ok: true; headline: string } | { ok: false; reason: string } {
  const header = profileHeader(args.pageText);
  if (!profileNameOk(args.expected.fullName, args.pageTitle, header.name)) return { ok: false, reason: "name does not match" };
  if (!header.headline) return { ok: false, reason: "no headline on the page" };
  if (!mentionsAnyCompany(header.headline, args.expected.companyAliases)) return { ok: false, reason: "headline does not name the employer" };
  if (FORMER.test(header.headline)) return { ok: false, reason: "headline describes a former role" };
  return { ok: true, headline: header.headline };
}

/**
 * Deterministic acceptance from the Experience section: a company heading that matches the
 * employer, followed by a role marked "(Current)" or ending in "Present" before the next company.
 */
export function verifyByExperience(args: {
  expected: { fullName: string; companyAliases: string[] };
  pageText: string;
  pageTitle?: string | null;
}): { ok: true; statement: string } | { ok: false; reason: string } {
  const text = args.pageText.replace(/\r/g, "");
  const header = profileHeader(text);
  if (!profileNameOk(args.expected.fullName, args.pageTitle, header.name)) return { ok: false, reason: "name does not match" };

  const headings = [...text.matchAll(/^###\s+(?:\[([^\]]+)\]\([^)]*\)|(.+?))\s*$/gm)];
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    const company = (h[1] ?? h[2] ?? "").trim();
    if (!company || !companyNamesMatch(company, args.expected.companyAliases)) continue;
    const end = headings[i + 1]?.index ?? text.length;
    const segment = text.slice((h.index ?? 0) + h[0].length, end).slice(0, 1_200);
    const roles = segment.split("\n").map((l) => l.trim()).filter(Boolean);
    const idx = roles.findIndex((l, k) => /\(current\)/i.test(l) || (/^#{4}\s/.test(roles[k - 1] ?? "") && /-\s*present\b/i.test(l)) || /-\s*present\b/i.test(l));
    if (idx === -1) continue;
    const roleLine = [...roles.slice(0, idx + 1)].reverse().find((l) => /^#{4}\s/.test(l)) ?? roles[idx];
    const clean = plainText(roleLine.replace(/^#+\s*/, "")).replace(/\s*\(current\)/i, "").trim();
    return { ok: true, statement: `${plainText(company)}: ${clean} (current)`.slice(0, 220) };
  }
  return { ok: false, reason: "no current role at this employer in the experience section" };
}
