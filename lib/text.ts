/** Text utilities: sanitisation, normalisation and slug/key helpers. Safe on server and client. */

/** Strip HTML tags, markdown images/links and control chars. Output is plain text only. */
export function sanitizeText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, "$1")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function slugify(s: string): string {
  return stripAccents(s)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const COMPANY_SUFFIX = /\b(incorporated|inc|llc|ltd|limited|corp|corporation|co|company|gmbh|ag|sa|plc|lp|llp|holdings|group|the)\b\.?/g;

/** Normalised company name for deterministic dedupe ("Acme Industries, Inc." → "acme industries"). */
export function normalizeCompanyName(name: string): string {
  return stripAccents(name)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(COMPANY_SUFFIX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePersonName(name: string): string {
  return stripAccents(name)
    .toLowerCase()
    .replace(/\b(dr|mr|mrs|ms|prof|jr|sr|ii|iii|phd|mba)\b\.?/g, " ")
    .replace(/[^a-z\s'-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitName(fullName: string): { firstName: string | null; lastName: string | null } {
  const parts = fullName.replace(/,.*$/, "").trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts[parts.length - 1] };
}

/** Normalised registrable-ish domain from a URL or host. */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let host = input.trim().toLowerCase();
  try {
    host = new URL(/^https?:\/\//.test(host) ? host : `https://${host}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "");
  return host.includes(".") ? host : null;
}

export function normalizeUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const u = new URL(input.trim());
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_)/i.test(k)) u.searchParams.delete(k);
    }
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function normalizeLinkedin(url: string | null | undefined): string | null {
  const n = normalizeUrl(url ?? undefined);
  if (!n) return null;
  return n.replace(/^http:/, "https:").replace(/\/\/[a-z]{2,3}\.linkedin\.com/, "//www.linkedin.com").toLowerCase();
}

/** Locate `needle` in `haystack` ignoring case/accents; returns a plain-text window around it. */
export function findSnippet(haystack: string, needle: string, radius = 220): string | null {
  const hay = stripAccents(haystack).toLowerCase();
  const n = stripAccents(needle).toLowerCase().trim();
  let idx = hay.indexOf(n);
  if (idx === -1) {
    const tokens = n.split(/\s+/).filter((t) => t.length > 1);
    if (tokens.length >= 2) {
      const re = new RegExp(`${escapeRegExp(tokens[0])}[^\\n]{0,40}?${escapeRegExp(tokens[tokens.length - 1])}`);
      const m = re.exec(hay);
      if (m) idx = m.index;
    }
  }
  if (idx === -1) return null;
  const start = Math.max(0, idx - radius);
  const end = Math.min(haystack.length, idx + needle.length + radius);
  return sanitizeText(haystack.slice(start, end)).replace(/\s*\n\s*/g, " · ").trim();
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function sha1(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
