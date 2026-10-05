import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

/** Rebuild daily momentum rows from real lead timestamps, then refresh today. No invented days. */
export async function refreshMetricSnapshots(): Promise<void> {
  await getDb().execute(sql`
    insert into metric_snapshots (day, momentum, quality, volume, updated_at)
    select
      (created_at at time zone 'utc')::date,
      coalesce(round(sum(priority_score * attendance_confidence / 100.0)), 0)::int,
      coalesce(round(avg(priority_score)), 0)::int,
      count(*)::int,
      now()
    from event_leads
    where status in ('needs_review', 'approved', 'hubspot_synced')
    group by 1
    on conflict (day) do update set
      momentum = excluded.momentum,
      quality = excluded.quality,
      volume = excluded.volume,
      updated_at = excluded.updated_at
  `);
}
