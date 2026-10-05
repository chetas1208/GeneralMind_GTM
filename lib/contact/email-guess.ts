/** Pattern-based work emails — always stored with `unverified` status (legacy: `guessed_unverified`). */

export const UNVERIFIED_EMAIL_STATUS = "unverified";
/** @deprecated use UNVERIFIED_EMAIL_STATUS */
export const GUESSED_EMAIL_STATUS = UNVERIFIED_EMAIL_STATUS;

export function isVerifiedEmailStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  if (status === UNVERIFIED_EMAIL_STATUS || status === "guessed_unverified" || status === "guessed") return false;
  if (status === "manual") return true;
  return /verified|likely|catch.?all|valid/i.test(status);
}

export function normalizeEmailDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  let d = domain.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? "";
  if (!d.includes(".")) return null;
  return d;
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
}

export function buildEmailGuessPatterns(input: {
  firstName?: string | null;
  lastName?: string | null;
  fullName: string;
  domain: string;
}): string[] {
  const domain = normalizeEmailDomain(input.domain);
  if (!domain) return [];

  let first = slug(input.firstName ?? "");
  let last = slug(input.lastName ?? "");
  if (!first || !last) {
    const parts = input.fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      first = first || slug(parts[0]!);
      last = last || slug(parts[parts.length - 1]!);
    }
  }
  if (!first) return [];
  if (!last) return [`${first}@${domain}`];

  const fi = first[0]!;
  const patterns = [
    `${first}.${last}@${domain}`,
    `${first}${last}@${domain}`,
    `${fi}.${last}@${domain}`,
    `${fi}${last}@${domain}`,
    `${first}_${last}@${domain}`,
    `${first}@${domain}`,
  ];
  return [...new Set(patterns.map((e) => e.toLowerCase()))];
}

export function pickPrimaryEmailGuess(input: Parameters<typeof buildEmailGuessPatterns>[0]): string | null {
  return buildEmailGuessPatterns(input)[0] ?? null;
}
