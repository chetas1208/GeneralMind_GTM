import "server-only";
import { and, desc, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { eventLeads, events } from "@/lib/db/schema";
import type { MomentumDriver } from "./types";

const ACTIVE = ["needs_review", "approved", "hubspot_synced"] as const;

/** Largest contributors to recent opportunity momentum, grouped by event. */
export async function loadDrivers(days = 30): Promise<MomentumDriver[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await getDb()
    .select({
      eventId: events.id,
      name: events.name,
      contribution: sql<number>`coalesce(sum(${eventLeads.priorityScore} * ${eventLeads.attendanceConfidence} / 100.0), 0)::int`,
      high: sql<number>`count(*) filter (where ${eventLeads.priorityScore} >= 80)::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(eventLeads)
    .innerJoin(events, sql`${events.id} = ${eventLeads.eventId}`)
    .where(and(inArray(eventLeads.status, [...ACTIVE]), gte(eventLeads.createdAt, since)))
    .groupBy(events.id, events.name)
    .orderBy(desc(sql`sum(${eventLeads.priorityScore} * ${eventLeads.attendanceConfidence} / 100.0)`))
    .limit(4);

  return rows
    .filter((r) => r.contribution > 0)
    .map((r) => ({
      direction: "up" as const,
      contribution: r.contribution,
      title: r.name,
      detail: `Added ${r.total} review-ready opportunities${r.high ? `, ${r.high} high priority` : ""}.`,
      href: `/events/${r.eventId}`,
    }));
}
