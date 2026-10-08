import "server-only";
import { createEvent, eventDedupeKey, findEventByDedupeKey, findEventByNameAndStart, getEvent, upsertEventSource } from "@/lib/db/queries/events";
import { getRunStatus } from "@/lib/db/queries/runs";
import { hostOf, resolveOfficialUrl } from "@/lib/events/discover";
import { extractEventCandidate } from "@/lib/ai/tasks";
import { AiValidationError } from "@/lib/ai/provider";
import { mapSettled } from "@/lib/concurrency";
import { assessEvent, autoSelectTopEvents, ensureOverviewContent, gatherEventSources } from "@/lib/events/service";
import { exaSearch } from "@/lib/integrations/exa/search";
import { normalizeUrl, sanitizeText } from "@/lib/text";
import type { RunContext, StepResult } from "./context";

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** Events gathered + assessed in parallel per batch (bounded: Exa and the model share rate limits). */
const ASSESS_PER_STEP = 3;

import { buildEventDiscoveryQueries, EXCLUDE_EVENT_DOMAINS } from "@/lib/intelligence/events/discover-queries";

const EXCLUDE_DOMAINS = EXCLUDE_EVENT_DOMAINS;

function buildQueries(): string[] {
  return buildEventDiscoveryQueries();
}

const QUERIES_PER_STEP = 3;
const CANDIDATES_PER_STEP = 4;
const MAX_HITS = 48;

export async function discoveryStep(ctx: RunContext): Promise<StepResult> {
  const c = ctx.cursor;
  const queries = buildQueries();

  /* ---- Stage 1: search ------------------------------------------------- */
  if ((c.queriesDone ?? 0) < queries.length) {
    ctx.setStage("discovering");
    const start = c.queriesDone ?? 0;
    const batch = queries.slice(start, start + QUERIES_PER_STEP);
    const results = await mapSettled(batch, QUERIES_PER_STEP, (q) =>
      exaSearch({ query: q, numResults: 8, excludeDomains: EXCLUDE_DOMAINS, startPublishedDate: "2026-03-01", maxCharacters: 3_500 }),
    );
    const hits = c.hits ?? [];
    const seen = new Set(hits.map((h) => normalizeUrl(h.url)));
    const perHost = new Map<string, number>();
    for (const h of hits) perHost.set(hostOf(h.url), (perHost.get(hostOf(h.url)) ?? 0) + 1);
    let added = 0;
    results.forEach((r, i) => {
      if (!r.ok) {
        ctx.note(`Search failed for "${batch[i].slice(0, 60)}": ${r.error instanceof Error ? r.error.message : String(r.error)}`, "warn");
        return;
      }
      for (const hit of r.value.results) {
        const key = normalizeUrl(hit.url);
        const host = hostOf(hit.url);
        if (!key || seen.has(key) || hits.length >= MAX_HITS || (perHost.get(host) ?? 0) >= 2) continue;
        seen.add(key);
        perHost.set(host, (perHost.get(host) ?? 0) + 1);
        hits.push({ url: hit.url, title: hit.title ?? null, text: sanitizeText(hit.text).slice(0, 3_500) });
        added++;
      }
    });
    c.hits = hits;
    c.queriesDone = start + batch.length;
    ctx.note(`Searched ${c.queriesDone}/${queries.length} queries · ${added} new candidate pages (${hits.length} total)`);
    return "continue";
  }

  /* ---- Stage 2: extract + persist event candidates ---------------------- */
  const hits = c.hits ?? [];
  if ((c.hitsDone ?? 0) < hits.length) {
    ctx.setStage("extracting");
    const start = c.hitsDone ?? 0;
    const batch = hits.slice(start, start + CANDIDATES_PER_STEP);
    const today = new Date().toISOString().slice(0, 10);
    const outcomes = await mapSettled(batch, 3, async (hit) => {
      if ((await getRunStatus(ctx.run.id)) === "cancel_requested") return { skipped: "cancelled by user" as const };
      if (hit.text.length < 200) return { skipped: "too little text" as const };
      const cand = await extractEventCandidate({ url: hit.url, title: hit.title, text: hit.text });
      if (!cand.isEvent || !cand.name) return { skipped: `not a specific event (${cand.rationale.slice(0, 80)})` };
      if (!cand.startDate || cand.startDate < today) return { skipped: `no verified upcoming date (${cand.startDate ?? "none"})` };
      if (cand.endDate && daysBetween(cand.startDate, cand.endDate) > 14) {
        return { skipped: `date range ${cand.startDate} → ${cand.endDate} is not a single event` };
      }
      const sameEvent = await findEventByNameAndStart(cand.name, cand.startDate);
      if (sameEvent) return { skipped: `duplicate of "${sameEvent.name}" (same name and start date)` };
      const officialUrl = await resolveOfficialUrl(hit.url, cand);
      if (!officialUrl) return { skipped: `no official website found for "${cand.name}"` };
      const key = eventDedupeKey(officialUrl);
      if (!key) return { skipped: "no resolvable domain" };
      const existing = await findEventByDedupeKey(key);
      if (existing) return { skipped: `duplicate of "${existing.name}"` };
      const event = await createEvent({
        name: cand.name,
        description: cand.description,
        websiteUrl: officialUrl,
        registrationUrl: normalizeUrl(cand.registrationUrl),
        startDate: cand.startDate,
        endDate: cand.endDate && cand.endDate >= cand.startDate ? cand.endDate : null,
        city: cand.city,
        region: cand.region,
        country: cand.country,
        venue: cand.venue,
        industryTags: cand.industries,
        audienceTags: cand.audiences,
        agendaThemes: cand.agendaThemes,
        sourceUrl: hit.url,
        dedupeKey: key,
        status: "discovered",
      });
      await upsertEventSource({ eventId: event.id, kind: "discovery", url: hit.url, title: hit.title, content: hit.text });
      return { created: event.id, name: event.name };
    });

    c.assessQueue ??= [];
    outcomes.forEach((o, i) => {
      if (!o.ok) {
        const reason = o.error instanceof AiValidationError ? "AI output invalid after repair" : o.error instanceof Error ? o.error.message : String(o.error);
        ctx.note(`Could not process ${new URL(batch[i].url).hostname}: ${reason}`, "warn");
        if (o.error instanceof AiValidationError) ctx.counters.aiFailures = (ctx.counters.aiFailures ?? 0) + 1;
      } else if ("created" in o.value && o.value.created) {
        c.assessQueue!.push(o.value.created);
        ctx.counts.eventsFound += 1;
        ctx.note(`Found event: ${o.value.name}`);
      } else if ("skipped" in o.value) {
        ctx.note(`Skipped ${new URL(batch[i].url).hostname}: ${o.value.skipped}`);
      }
    });
    c.hitsDone = start + batch.length;
    return "continue";
  }

  /* ---- Stage 3: gather participant pages + assess relevance ------------ */
  const queue = c.assessQueue ?? [];
  if ((c.assessDone ?? 0) < queue.length) {
    ctx.setStage("scoring");
    const start = c.assessDone ?? 0;
    const batch = queue.slice(start, start + ASSESS_PER_STEP);
    const results = await mapSettled(batch, ASSESS_PER_STEP, async (id) => {
      if ((await getRunStatus(ctx.run.id)) === "cancel_requested") return null;
      const event = await getEvent(id);
      if (!event) return null;
      const gathered = await gatherEventSources(id);
      await ensureOverviewContent(id);
      const res = await assessEvent(id);
      return { event, gathered, res };
    });
    for (const r of results) {
      if (!r.ok) {
        ctx.note(`Could not assess an event: ${r.error instanceof Error ? r.error.message : String(r.error)}`, "warn");
        ctx.counters.aiFailures = (ctx.counters.aiFailures ?? 0) + 1;
        continue;
      }
      if (!r.value) continue;
      const { event, gathered, res } = r.value;
      ctx.note(
        res.ok
          ? `Assessed ${event.name}: relevance ${res.score}/100 · ${gathered.stored} participant pages preserved`
          : `Could not assess ${event.name}: ${res.error}`,
        res.ok ? "info" : "warn",
      );
      if (!res.ok) ctx.counters.aiFailures = (ctx.counters.aiFailures ?? 0) + 1;
    }
    c.assessDone = start + batch.length;
    return "continue";
  }

  const promoted = await autoSelectTopEvents(10);
  ctx.note(`${ctx.counts.eventsFound} new events · ${promoted} promoted to the Radar`);
  return "done";
}
