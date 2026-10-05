import "server-only";
import { desc, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { companies, signalClusters, signals } from "@/lib/db/schema";

export async function listRecentSignals(limit = 20) {
  return getDb()
    .select({
      id: signals.id,
      type: signals.type,
      direction: signals.direction,
      title: signals.title,
      summary: signals.summary,
      discoveredAt: signals.discoveredAt,
      companyId: companies.id,
      companyName: companies.name,
    })
    .from(signals)
    .innerJoin(companies, eq(companies.id, signals.companyId))
    .where(eq(signals.status, "verified"))
    .orderBy(desc(signals.discoveredAt))
    .limit(limit);
}

export async function listSignalsForCompany(companyId: string) {
  return getDb().select().from(signals).where(eq(signals.companyId, companyId)).orderBy(desc(signals.discoveredAt));
}

export async function listClustersForCompany(companyId: string) {
  return getDb().select().from(signalClusters).where(eq(signalClusters.companyId, companyId)).orderBy(desc(signalClusters.strength));
}

export async function listTopAccountsByPriority(limit = 10) {
  return getDb()
    .select()
    .from(companies)
    .where(gte(companies.accountPriority, 1))
    .orderBy(desc(companies.accountPriority))
    .limit(limit);
}

export async function signalStats() {
  const db = getDb();
  const rows = await db.select({ status: signals.status, direction: signals.direction }).from(signals);
  return {
    total: rows.length,
    verified: rows.filter((r) => r.status === "verified").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
    positive: rows.filter((r) => r.direction === "positive").length,
    negative: rows.filter((r) => r.direction === "negative").length,
  };
}
