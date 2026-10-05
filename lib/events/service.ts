import "server-only";
import { getEvent, listEventSources, updateEvent, upsertEventSource, eventDomain } from "@/lib/db/queries/events";
import { analyzeEventRelevance } from "@/lib/ai/tasks";
import { AiValidationError } from "@/lib/ai/provider";
import { exaSearch } from "@/lib/integrations/exa/search";
import { scrapePage } from "@/lib/integrations/firecrawl/scrape";
import { createLogger } from "@/lib/logger";
import { scoreEvent } from "@/lib/scoring/event-score";
import { sanitizeText } from "@/lib/text";

const log = createLogger("events");

export type SourceKind = "speakers" | "sponsors" | "exhibitors" | "agenda" | "overview" | "discovery" | "other";

export function classifySource(url: string, title?: string | null): SourceKind {
  const s = `${url} ${title ?? ""}`.toLowerCase();
  if (/(speaker|faculty|presenter|keynote|thought-leader|lineup)/.test(s)) return "speakers";
  if (/(exhibitor|exhibit(ing)?-|floor-?plan|expo-?guide|show-?floor|vendor-?list)/.test(s)) return "exhibitors";
  if (/(sponsor|partner)/.test(s)) return "sponsors";
  if (/(agenda|schedule|program|session|track)/.test(s)) return "agenda";
  return "other";
}

const PARTICIPANT_QUERIES: { kind: SourceKind; q: (name: string) => string }[] = [
  { kind: "speakers", q: (n) => `${n} speakers keynote featured speakers` },
  { kind: "sponsors", q: (n) => `${n} sponsors partners` },
  { kind: "exhibitors", q: (n) => `${n} exhibitor list exhibitors` },
  { kind: "agenda", q: (n) => `${n} agenda sessions schedule` },
];

/**
 * Stage A: find the event's own speaker / sponsor / exhibitor / agenda pages via Exa,
 * restricted to the official domain, and persist them as preserved sources.
 * Returns the number of new/updated sources.
 */
export async function gatherEventSources(eventId: string): Promise<{ stored: number; byKind: Record<string, number> }> {
  const event = await getEvent(eventId);
  if (!event) throw new Error("Event not found");
  const domain = eventDomain(event.websiteUrl);
  const byKind: Record<string, number> = {};
  let stored = 0;
  if (!domain) return { stored, byKind };

  for (const spec of PARTICIPANT_QUERIES) {
    try {
      const { results } = await exaSearch({
        query: spec.q(event.name),
        includeDomains: [domain],
        numResults: 4,
        maxCharacters: 8_000,
        type: "auto",
      });
      for (const r of results) {
        const kind = classifySource(r.url, r.title);
        const finalKind: SourceKind = kind === "other" ? spec.kind : kind;
        await upsertEventSource({
          eventId,
          kind: finalKind,
          url: r.url,
          title: r.title,
          content: sanitizeText(r.text),
        });
        byKind[finalKind] = (byKind[finalKind] ?? 0) + 1;
        stored++;
      }
    } catch (e) {
      log.warn("source search failed", { eventId, kind: spec.kind, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { stored, byKind };
}

/** Pull deeper content with Firecrawl only when Exa's text for the official page is thin. */
export async function ensureOverviewContent(eventId: string): Promise<boolean> {
  const event = await getEvent(eventId);
  if (!event?.websiteUrl) return false;
  const sources = await listEventSources(eventId);
  const total = sources.reduce((a, s) => a + (s.content?.length ?? 0), 0);
  if (total >= 6_000) return false;
  try {
    const page = await scrapePage(event.websiteUrl);
    await upsertEventSource({
      eventId,
      kind: "overview",
      url: event.websiteUrl,
      title: page.title,
      content: sanitizeText(page.markdown).slice(0, 40_000),
    });
    return true;
  } catch (e) {
    log.warn("firecrawl overview failed; continuing with Exa content", { eventId, error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

/**
 * Event relevance = model's *categorical* judgement → deterministic numeric score.
 * Failure of the model leaves the event unscored but keeps all source data.
 */
export async function assessEvent(eventId: string): Promise<{ ok: boolean; score?: number; error?: string }> {
  const event = await getEvent(eventId);
  if (!event) return { ok: false, error: "Event not found" };
  const sources = await listEventSources(eventId);
  const text = sources
    .map((s) => `## [${s.kind}] ${s.title ?? s.url}\n${(s.content ?? "").slice(0, 6_000)}`)
    .join("\n\n");
  if (text.length < 200) return { ok: false, error: "Not enough source text to assess" };

  try {
    const a = await analyzeEventRelevance({ name: event.name, description: event.description, text });
    const hasLists = sources.some((s) => s.kind === "speakers" || s.kind === "exhibitors" || s.kind === "sponsors");
    const industries = [...new Set([...event.industryTags, ...a.industries])];
    const breakdown = scoreEvent({
      industryTags: industries,
      name: event.name,
      description: event.description,
      startDate: event.startDate,
      decisionMakerDensity: a.decisionMakerDensity,
      scale: a.scale,
      hasOfficialUrl: Boolean(event.websiteUrl),
      hasSpeakerOrExhibitorList: hasLists,
    });
    await updateEvent(eventId, {
      relevanceScore: breakdown.total,
      relevanceReason: a.reason,
      industryTags: industries,
      audienceTags: [...new Set([...event.audienceTags, ...a.audiences])].slice(0, 15),
      agendaThemes: [...new Set([...event.agendaThemes, ...a.agendaThemes])].slice(0, 15),
      targetPersonas: a.targetPersonas.slice(0, 12),
      assessment: {
        decisionMakerDensity: a.decisionMakerDensity,
        scale: a.scale,
        breakdown,
        assessedAt: new Date().toISOString(),
      },
    });
    return { ok: true, score: breakdown.total };
  } catch (e) {
    const message = e instanceof AiValidationError ? `AI output failed validation: ${e.message}` : e instanceof Error ? e.message : String(e);
    log.warn("event assessment failed", { eventId, error: message });
    return { ok: false, error: message };
  }
}

/** Auto-promote the strongest verified upcoming events to the Radar (ranked + diverse). */
export async function autoSelectTopEvents(limit = 10): Promise<number> {
  const { listEvents } = await import("@/lib/db/queries/events");
  const { selectTopEvents } = await import("@/lib/intelligence/events/select-top-events");
  const all = await listEvents({ statuses: ["discovered", "selected"] });
  return selectTopEvents(
    all.map((e) => ({
      id: e.id,
      name: e.name,
      relevanceScore: e.relevanceScore,
      startDate: e.startDate,
      industryTags: e.industryTags,
      agendaThemes: e.agendaThemes,
      status: e.status,
    })),
    limit,
  );
}
