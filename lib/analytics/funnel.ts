import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { companies, eventLeads, people, signals } from "@/lib/db/schema";
import { CONFIRMED_ATTENDANCE } from "@/lib/scoring/config";
import type { FunnelStage } from "./types";

export async function loadFunnel(): Promise<{ stages: FunnelStage[]; dropoff: string | null }> {
  const db = getDb();
  const [sig] = await db.select({ n: sql<number>`count(*)::int` }).from(signals).where(eq(signals.status, "verified"));
  const [acct] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(companies)
    .where(gte(companies.companyFitScore, 20));
  const [ppl] = await db.select({ n: sql<number>`count(*)::int` }).from(people);
  const confirmed = [...CONFIRMED_ATTENDANCE];
  const [verified] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(eventLeads)
    .where(and(inArray(eventLeads.attendanceType, confirmed), gte(eventLeads.attendanceConfidence, 50)));
  const [review] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(eventLeads)
    .where(eq(eventLeads.status, "needs_review"));
  const [approved] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(eventLeads)
    .where(eq(eventLeads.status, "approved"));
  const [crm] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(eventLeads)
    .where(eq(eventLeads.status, "hubspot_synced"));

  const stages: FunnelStage[] = [
    { key: "signals", label: "Signals", count: sig?.n ?? 0 },
    { key: "accounts", label: "Accounts", count: acct?.n ?? 0 },
    { key: "people", label: "People", count: ppl?.n ?? 0, href: "/leads?view=all" },
    { key: "verified", label: "Verified", count: verified?.n ?? 0, href: "/leads?view=all&minAttendance=50" },
    { key: "review", label: "Review-ready", count: review?.n ?? 0, href: "/leads?view=review" },
    { key: "approved", label: "Approved", count: approved?.n ?? 0, href: "/leads?view=approved" },
    { key: "crm", label: "CRM", count: crm?.n ?? 0, href: "/leads?view=synced" },
  ];

  let dropoff: string | null = null;
  let worst = 0;
  for (let i = 1; i < stages.length; i++) {
    const prev = stages[i - 1]!.count;
    const cur = stages[i]!.count;
    if (prev <= 0) continue;
    const lost = 1 - cur / prev;
    if (lost > worst && lost > 0.25) {
      worst = lost;
      dropoff = `Largest drop-off: ${stages[i - 1]!.label} → ${stages[i]!.label}. ${Math.round(lost * 100)}% do not continue to the next stage.`;
    }
  }
  return { stages, dropoff };
}
