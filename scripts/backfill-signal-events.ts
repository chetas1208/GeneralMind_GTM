/**
 * Sync existing event graph → verified event signals + account intelligence.
 * Run: pnpm exec tsx scripts/backfill-signal-events.ts
 */
import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { desc, eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { updateAccountIntelligenceWithDb } from "../lib/signals/account-intelligence";
import { discoverEventSignals, verifyEventSignal } from "../lib/signals/adapters/events-core";
import { rebuildSignalClustersWithDb } from "../lib/signals/cluster-db";
import { upsertSignalWithDb } from "../lib/signals/persist-db";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const sqlClient = neon(process.env.DATABASE_URL);
  const db = drizzle(sqlClient, { schema });

  const rows = (await sqlClient`
    SELECT DISTINCT company_id AS id FROM event_companies
    UNION
    SELECT DISTINCT company_id AS id FROM event_leads WHERE company_id IS NOT NULL
  `) as { id: string }[];

  let verifiedUpserts = 0;
  let rejectedCandidates = 0;
  for (const { id } of rows) {
    if (!id) continue;
    const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, id)).limit(1);
    if (!company) continue;
    const input = { companyId: id, companyName: company.name, domain: company.domain };
    const candidates = await discoverEventSignals(db, input);
    for (const c of candidates) {
      const verified = verifyEventSignal(c, input);
      if (!verified) {
        rejectedCandidates++;
        continue;
      }
      await upsertSignalWithDb(db, id, verified);
      verifiedUpserts++;
    }
    await rebuildSignalClustersWithDb(db, id);
    await updateAccountIntelligenceWithDb(db, id);
  }

  const all = await db.select({ status: schema.signals.status, direction: schema.signals.direction }).from(schema.signals);
  const stats = {
    total: all.length,
    verified: all.filter((r) => r.status === "verified").length,
    rejected: all.filter((r) => r.status === "rejected").length,
    positive: all.filter((r) => r.direction === "positive").length,
    negative: all.filter((r) => r.direction === "negative").length,
  };

  const top = await db
    .select({ name: schema.companies.name, priority: schema.companies.accountPriority })
    .from(schema.companies)
    .orderBy(desc(schema.companies.accountPriority))
    .limit(5);

  console.log(JSON.stringify({ companies: rows.length, verifiedUpserts, rejectedCandidates, ...stats, topAccounts: top }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
