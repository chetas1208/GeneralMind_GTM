import { namesMatch } from "@/lib/pipeline/stages/shared";
import { normalizeCompanyName, normalizeDomain } from "@/lib/text";

/** Hosts that describe a company but are never its own website. */
const NOT_A_COMPANY_SITE =
  /(^|\.)(linkedin|facebook|twitter|x|instagram|youtube|wikipedia|crunchbase|bloomberg|reuters|forbes|zoominfo|dnb|glassdoor|indeed|pitchbook|owler|yahoo|google|apollo|rocketreach|cbinsights|craft|tracxn|growjo|opencorporates|sec)\.[a-z.]+$/i;

/** The domain label plausibly spells the company name (acme.com for Acme Industries). */
export function domainPlausible(name: string, domain: string): boolean {
  const label = domain.split(".")[0].replace(/[^a-z0-9]/g, "");
  const compact = normalizeCompanyName(name).replace(/[^a-z0-9]/g, "");
  if (label.length < 3 || compact.length < 3) return false;
  return label.includes(compact) || compact.includes(label);
}

const isHomepage = (url: string) => {
  try {
    const p = new URL(url).pathname.replace(/\/+$/, "");
    return p === "" || /^\/[a-z]{2}(-[a-z]{2})?$/i.test(p); // "/" or a locale root like "/en-us"
  } catch {
    return false;
  }
};

/** Website titles look like "Johnson & Johnson | Healthcare" or "Home - Acme Corp". */
const titleNamesCompany = (title: string | null | undefined, company: string) =>
  (title ?? "")
    .split(/\s[|–—:-]\s|\s·\s/)
    .map((t) => t.trim())
    .filter(Boolean)
    .some((seg) => namesMatch(seg, company));

export type DomainCandidate = { url: string; title?: string | null };

/**
 * Pick the company's own website from search results.
 *  1. A domain whose label spells the company name; otherwise
 *  2. a site ROOT whose page title names the company (jnj.com → "Johnson & Johnson").
 * Aggregators and social profiles are never accepted, and a deep link never qualifies via rule 2.
 */
export function pickCompanyDomain(name: string, results: DomainCandidate[]): string | null {
  const usable = results
    .map((r) => ({ r, domain: normalizeDomain(r.url) }))
    .filter((x): x is { r: DomainCandidate; domain: string } => Boolean(x.domain) && !NOT_A_COMPANY_SITE.test(x.domain as string));
  for (const { domain } of usable) if (domainPlausible(name, domain)) return domain;
  for (const { r, domain } of usable) if (isHomepage(r.url) && titleNamesCompany(r.title, name)) return domain;
  return null;
}
