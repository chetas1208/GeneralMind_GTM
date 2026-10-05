import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { companies } from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { updateAccountIntelligenceWithDb } from "./account-intelligence";
import { rebuildSignalClustersWithDb } from "./cluster-db";
import { isExpired } from "./freshness";
import { upsertSignalWithDb } from "./persist-db";
import { getSignalAdapters } from "./registry";
import type { SignalDiscoveryInput } from "./types";

export type RefreshStats = {
  discovered: number;
  verified: number;
  rejected: number;
  clusters: number;
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

  const stats: RefreshStats = { discovered: 0, verified: 0, rejected: 0, clusters: 0 };

  for (const adapter of getSignalAdapters(opts.adapters)) {
    const candidates = await adapter.discover(input);
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
      await upsertSignalWithDb(db, companyId, verified);
      stats.verified++;
    }
  }

  stats.clusters = await rebuildSignalClustersWithDb(db, companyId);
  await updateAccountIntelligenceWithDb(db, companyId);
  return stats;
}
