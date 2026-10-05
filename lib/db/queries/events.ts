import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { eventCompanies, eventLeads, events, eventSources, sourceRuns } from "@/lib/db/schema";
import { normalizeUrl, slugify } from "@/lib/text";

export type EventRow = typeof events.$inferSelect;
export type EventInsert = typeof events.$inferInsert;
export type EventSourceRow = typeof eventSources.$inferSelect;

/**
 * Dedupe key: official host with leading year/"www" subdomains stripped ("2026.modexshow.com" → "modexshow.com").
 * Association hubs that host many events (`naw.org/events/shift-2027`) keep the event path segment.
 */
export function eventDedupeKey(url: string | null | undefined): string | null {
  const n = normalizeUrl(url ?? undefined);
  if (!n) return null;
  try {
    const u = new URL(n);
    const host = u.hostname.replace(/^(www|\d{4})\./, "").toLowerCase();
    const m = u.pathname.match(/^\/(events?|conferences?|summits?|expos?|shows?|programs?)\/([^/]+)/i);
    return m ? `${host}/${m[1].toLowerCase()}/${m[2].toLowerCase()}` : host;
  } catch {
    return null;
  }
}

/** Host-only form of the dedupe key, for domain-restricted searches. */
export function eventDomain(url: string | null | undefined): string | null {
  return eventDedupeKey(url)?.split("/")[0] ?? null;
}

export async function uniqueSlug(base: string): Promise<string> {
  const db = getDb();
  const root = slugify(base) || "event";
  const existing = await db.select({ slug: events.slug }).from(events).where(sql`${events.slug} like ${root + "%"}`);
  const taken = new Set(existing.map((e) => e.slug));
  if (!taken.has(root)) return root;
  for (let i = 2; i < 200; i++) if (!taken.has(`${root}-${i}`)) return `${root}-${i}`;
  return `${root}-${Date.now()}`;
}

export async function findEventByDedupeKey(key: string): Promise<EventRow | null> {
  const [row] = await getDb().select().from(events).where(eq(events.dedupeKey, key)).limit(1);
  return row ?? null;
}

/** Same event announced under two domains (e.g. a vanity shortener): same start date + same year-less name. */
export const eventNameKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\b(the|annual|edition|\d+(st|nd|rd|th))\b/g, " ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();

export async function findEventByNameAndStart(name: string, startDate: string): Promise<EventRow | null> {
  const key = eventNameKey(name);
  if (!key) return null;
  const sameDay = await getDb().select().from(events).where(eq(events.startDate, startDate));
  return sameDay.find((e) => eventNameKey(e.name) === key) ?? null;
}

export async function getEvent(id: string): Promise<EventRow | null> {
  const [row] = await getDb().select().from(events).where(eq(events.id, id)).limit(1);
  return row ?? null;
}

export async function createEvent(input: Omit<EventInsert, "id" | "slug" | "createdAt" | "updatedAt"> & { slug?: string }): Promise<EventRow> {
  const slug = input.slug ?? (await uniqueSlug(input.name));
  const [row] = await getDb()
    .insert(events)
    .values({ ...input, slug })
    .returning();
  return row;
}

export async function updateEvent(id: string, patch: Partial<Omit<EventInsert, "id" | "createdAt">>): Promise<EventRow | null> {
  const [row] = await getDb()
    .update(events)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(events.id, id))
    .returning();
  return row ?? null;
}

export async function deleteEvent(id: string): Promise<void> {
  await getDb().delete(events).where(eq(events.id, id));
}

export type EventListItem = EventRow & {
  companyCount: number;
  leadCount: number;
  reviewCount: number;
  latestRun: { id: string; status: string; stage: string; completedAt: Date | null; error: string | null } | null;
};

export async function listEvents(opts: { statuses?: EventRow["status"][] } = {}): Promise<EventListItem[]> {
  const db = getDb();
  const where = opts.statuses?.length ? inArray(events.status, opts.statuses) : undefined;
  const rows = await db
    .select()
    .from(events)
    .where(where)
    .orderBy(desc(events.relevanceScore), asc(events.startDate));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [companyCounts, leadCounts, runs] = await Promise.all([
    db
      .select({ eventId: eventCompanies.eventId, n: sql<number>`count(distinct ${eventCompanies.companyId})::int` })
      .from(eventCompanies)
      .where(inArray(eventCompanies.eventId, ids))
      .groupBy(eventCompanies.eventId),
    db
      .select({
        eventId: eventLeads.eventId,
        n: sql<number>`count(*)::int`,
        review: sql<number>`count(*) filter (where ${eventLeads.status} = 'needs_review')::int`,
      })
      .from(eventLeads)
      .where(inArray(eventLeads.eventId, ids))
      .groupBy(eventLeads.eventId),
    db
      .selectDistinctOn([sourceRuns.eventId], {
        id: sourceRuns.id,
        eventId: sourceRuns.eventId,
        status: sourceRuns.status,
        stage: sourceRuns.stage,
        completedAt: sourceRuns.completedAt,
        error: sourceRuns.error,
      })
      .from(sourceRuns)
      .where(and(inArray(sourceRuns.eventId, ids), eq(sourceRuns.kind, "lead_sourcing")))
      .orderBy(sourceRuns.eventId, desc(sourceRuns.createdAt)),
  ]);

  const cc = new Map(companyCounts.map((c) => [c.eventId, c.n]));
  const lc = new Map(leadCounts.map((c) => [c.eventId, c]));
  const rr = new Map(runs.map((r) => [r.eventId, r]));
  return rows.map((r) => ({
    ...r,
    companyCount: cc.get(r.id) ?? 0,
    leadCount: lc.get(r.id)?.n ?? 0,
    reviewCount: lc.get(r.id)?.review ?? 0,
    latestRun: rr.get(r.id)
      ? { id: rr.get(r.id)!.id, status: rr.get(r.id)!.status, stage: rr.get(r.id)!.stage, completedAt: rr.get(r.id)!.completedAt, error: rr.get(r.id)!.error }
      : null,
  }));
}

/* ------------------------------ Event sources ----------------------------- */

export async function upsertEventSource(input: {
  eventId: string;
  kind: string;
  url: string;
  title?: string | null;
  content?: string | null;
}): Promise<void> {
  const url = normalizeUrl(input.url) ?? input.url;
  await getDb()
    .insert(eventSources)
    .values({ eventId: input.eventId, kind: input.kind, url, title: input.title ?? null, content: input.content ?? null })
    .onConflictDoUpdate({
      target: [eventSources.eventId, eventSources.url],
      set: {
        // Never downgrade a specific kind to "other"; keep the longest content.
        kind: sql`case when excluded.kind = 'other' then ${eventSources.kind} else excluded.kind end`,
        title: sql`coalesce(excluded.title, ${eventSources.title})`,
        content: sql`case when length(coalesce(excluded.content, '')) > length(coalesce(${eventSources.content}, '')) then excluded.content else ${eventSources.content} end`,
        retrievedAt: new Date(),
      },
    });
}

export async function listEventSources(eventId: string): Promise<EventSourceRow[]> {
  return getDb().select().from(eventSources).where(eq(eventSources.eventId, eventId)).orderBy(asc(eventSources.kind), asc(eventSources.createdAt));
}
