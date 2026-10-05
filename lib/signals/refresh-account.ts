import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { companies } from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { updateAccountIntelligenceWithDb } from "./account-intelligence";
import { rebuildSignalClustersWithDb } from "./cluster-db";
import { isExpired } from "./freshness";
import { upsertSignalWithDb } from "./persist-db";
import { getSignalAdapters } from "./registry";
import type { SignalCandidate, SignalDiscoveryInput, VerifiedSignal } from "./types";

/** Several articles about the same development must not read as several signals. */
const MAX_PER_TYPE = 2;

export type RefreshStats = {
  discovered: number;
  verified: number;
  rejected: number;
  clusters: number;
  /** Adapters that failed (provider outage, rate limit). The refresh continues with the others. */
  adapterErrors: { adapter: string; message: string }[];
};

type Db = NeonHttpDatabase<typeof schema>;

export async function refreshAccountSignalsWithDb(
  db: Db,
  companyId: string,
  opts: { adapters?: string[] } = {},
): Promise<RefreshStats> {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  if (!company) throw new Error("Company not found");

  const input: SignalDiscoveryInput = {
    companyId,
    companyName: company.name,
    domain: company.domain,
  };

  const stats: RefreshStats = { discovered: 0, verified: 0, rejected: 0, clusters: 0, adapterErrors: [] };
  const adapters = getSignalAdapters(opts.adapters);

  // Discovery is I/O bound and independent per adapter: run in parallel, isolate failures.
  const discovered = await Promise.allSettled(adapters.map((a) => a.discover(input)));

  const accepted: VerifiedSignal[] = [];
  for (let i = 0; i < adapters.length; i++) {
    const adapter = adapters[i];
    const result = discovered[i];
    if (result.status === "rejected") {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      stats.adapterErrors.push({ adapter: adapter.id, message: message.slice(0, 200) });
      continue;
    }
    const candidates: SignalCandidate[] = result.value;
    stats.discovered += candidates.length;
    for (const c of candidates) {
      if (c.occurredAt && isExpired(c.type, c.occurredAt)) {
        stats.rejected++;
        continue;
      }
      const verified = await adapter.verify(c, input);
      if (!verified) {
        stats.rejected++;
        continue;
      }
      accepted.push(verified);
    }
  }

  // Keep the freshest few per type; the rest are treated as repeats of the same underlying development.
  const byType = new Map<string, VerifiedSignal[]>();
  for (const v of accepted) byType.set(v.type, [...(byType.get(v.type) ?? []), v]);
  for (const [type, list] of byType) {
    if (type === "event") {
      // Event participation records are distinct facts keyed by event/person; they dedupe on their own key.
      for (const v of list) {
        await upsertSignalWithDb(db, companyId, v);
        stats.verified++;
      }
      continue;
    }
    list.sort((a, b) => (b.occurredAt?.getTime() ?? 0) - (a.occurredAt?.getTime() ?? 0));
    for (const [i, v] of list.entries()) {
      if (i >= MAX_PER_TYPE) {
        stats.rejected++;
        continue;
      }
      await upsertSignalWithDb(db, companyId, v);
      stats.verified++;
    }
  }

  stats.clusters = await rebuildSignalClustersWithDb(db, companyId);
  const external = adapters.some((a) => a.id !== "event") && stats.adapterErrors.length < adapters.length;
  await updateAccountIntelligenceWithDb(db, companyId, external ? { externalRefreshAt: new Date().toISOString() } : {});
  return stats;
}
