import "server-only";
import { extractEventCandidate } from "@/lib/ai/tasks";
import type { EventCandidate } from "@/lib/ai/schemas";
import { createLogger } from "@/lib/logger";
import { exaSearch } from "@/lib/integrations/exa/search";
import { normalizeUrl, stripAccents } from "@/lib/text";
import { eventDedupeKey } from "@/lib/db/queries/events";

const log = createLogger("discover");

/** Press, aggregator and social hosts are never an event's "official" site. */
export const NON_OFFICIAL_HOSTS =
  /(prnewswire|businesswire|globenewswire|openpr|einpresswire|prweb|streetinsider|newswire|10times|eventbrite|allevents|meetup|linkedin|facebook|instagram|twitter|youtube|wikipedia|medium\.com|substack|eurotravelo|reddit|conferenceindex|eventsmanagers|tradeshowalliance|eventseye|trade-fair|tradefairdates|worldbakers|fbtech|foodtradejournal|logisticsmanager|foodlogistics|supplychaindive)/i;

export const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return "";
  }
};

export const isNonOfficial = (u: string) => NON_OFFICIAL_HOSTS.test(hostOf(u));

/** "MODEX 2027" → ["modex"]: significant tokens excluding years and filler. */
export function nameTokens(name: string): string[] {
  const stop = new Set(["the", "annual", "conference", "summit", "expo", "show", "convention", "and", "of", "for", "in", "at", "th", "st", "nd", "rd"]);
  return stripAccents(name)
    .toLowerCase()
    .replace(/\b20\d{2}\b/g, " ")
    .replace(/\b\d+(st|nd|rd|th)\b/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !stop.has(t));
}

function namesOverlap(a: string, b: string): boolean {
  const x = nameTokens(a);
  const y = new Set(nameTokens(b));
  if (!x.length || !y.size) return false;
  const common = x.filter((t) => y.has(t)).length;
  return common >= Math.min(2, x.length, y.size) || (common >= 1 && Math.min(x.length, y.size) === 1);
}

/** Use the origin for single-event sites, but keep the path for association hubs hosting many events. */
export function canonicalOfficialUrl(url: string): string | null {
  const n = normalizeUrl(url);
  if (!n) return null;
  const u = new URL(n);
  const key = eventDedupeKey(n);
  return key && key.includes("/") ? n : u.origin;
}

async function resolveOfficialSite(cand: EventCandidate): Promise<string | null> {
  if (!cand.name) return null;
  const { results } = await exaSearch({
    query: `${cand.name} official website agenda speakers registration`,
    numResults: 6,
    maxCharacters: 3_000,
  });
  const candidates = results.filter((r) => !isNonOfficial(r.url) && (r.text?.length ?? 0) > 300).slice(0, 3);
  for (const r of candidates) {
    try {
      const c = await extractEventCandidate({ url: r.url, title: r.title, text: r.text ?? "" });
      if (c.isEvent && c.isOfficialSite && c.name && namesOverlap(c.name, cand.name)) {
        log.info("resolved official site", { event: cand.name, host: hostOf(r.url) });
        return canonicalOfficialUrl(r.url);
      }
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

/** Decide the event's official website; null means "cannot verify – do not create the event". */
export async function resolveOfficialUrl(hitUrl: string, cand: EventCandidate): Promise<string | null> {
  if (cand.isOfficialSite && !isNonOfficial(hitUrl)) return canonicalOfficialUrl(hitUrl);
  const stated = normalizeUrl(cand.officialUrl);
  if (stated && !isNonOfficial(stated)) return canonicalOfficialUrl(stated);
  return resolveOfficialSite(cand);
}
