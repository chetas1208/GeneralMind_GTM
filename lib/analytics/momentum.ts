import "server-only";
import { and, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { eventLeads, events, metricSnapshots } from "@/lib/db/schema";
import { refreshMetricSnapshots } from "./snapshots";
import type { MomentumPoint, MomentumSeries } from "./types";

const ACTIVE = ["needs_review", "approved", "hubspot_synced"] as const;

/**
 * Daily opportunity momentum from persisted leads only.
 * momentum(day) = sum(priority × evidence confidence / 100) for review-ready+ leads created that day.
 * quality = average priority that day. volume = count.
 */
export async function loadMomentum(range: "7" | "30" | "90"): Promise<MomentumSeries> {
  const days = Number(range);
  const db = getDb();
  try {
    await refreshMetricSnapshots();
  } catch {
    /* snapshot table not migrated yet — chart still uses live lead rows */
  }
  const since = new Date(Date.now() - days * 86_400_000);
  const prevSince = new Date(Date.now() - days * 2 * 86_400_000);

  const rows = await db
    .select({
      day: sql<string>`to_char(${eventLeads.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
      momentum: sql<number>`coalesce(sum(${eventLeads.priorityScore} * ${eventLeads.attendanceConfidence} / 100.0), 0)::float`,
      quality: sql<number>`coalesce(avg(${eventLeads.priorityScore}), 0)::float`,
      volume: sql<number>`count(*)::int`,
      eventName: sql<string | null>`max(${events.name})`,
    })
    .from(eventLeads)
    .innerJoin(events, sql`${events.id} = ${eventLeads.eventId}`)
    .where(and(inArray(eventLeads.status, [...ACTIVE]), gte(eventLeads.createdAt, prevSince)))
    .groupBy(sql`to_char(${eventLeads.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`)
    .orderBy(sql`1`);

  let snaps: { day: string; momentum: number; quality: number; volume: number }[] = [];
  try {
    snaps = await db
      .select({
        day: sql<string>`to_char(${metricSnapshots.day}, 'YYYY-MM-DD')`,
        momentum: metricSnapshots.momentum,
        quality: metricSnapshots.quality,
        volume: metricSnapshots.volume,
      })
      .from(metricSnapshots)
      .where(gte(metricSnapshots.day, prevSince.toISOString().slice(0, 10)));
  } catch {
    snaps = [];
  }
  const snapByDay = new Map(snaps.map((s) => [s.day, s]));

  const byDay = new Map(rows.map((r) => [r.day, r]));
  const points: MomentumPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    const row = byDay.get(key);
    const snap = snapByDay.get(key);
    points.push({
      date: key,
      momentum: snap?.momentum ?? Math.round(row?.momentum ?? 0),
      quality: snap?.quality ?? Math.round(row?.quality ?? 0),
      volume: snap?.volume ?? row?.volume ?? 0,
      driver: row?.volume ? `${row.volume} opportunities${row.eventName ? ` · ${row.eventName}` : ""}` : "No new review-ready opportunities",
    });
  }

  const current = points.reduce((s, p) => s + p.momentum, 0);
  const previous = rows
    .filter((r) => r.day < since.toISOString().slice(0, 10))
    .reduce((s, r) => s + Math.round(r.momentum), 0);
  const deltaPct = previous > 0 ? Math.round(((current - previous) / previous) * 100) : current > 0 ? 100 : null;

  const earliest = rows[0]?.day ?? null;
  const spanDays = earliest ? Math.round((Date.now() - Date.parse(earliest)) / 86_400_000) : 0;
  const historyNote =
    spanDays < days
      ? `Data collection started ${earliest ?? "recently"}. Trend history will become richer over time.`
      : null;

  return { range, points, current, previous, deltaPct, historyNote, earliest };
}
