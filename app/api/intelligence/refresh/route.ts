import { sql, desc, gte } from "drizzle-orm";
import { requireReviewer } from "@/lib/auth";
import { handle, json } from "@/lib/api";
import { getDb } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { REFRESH_COOLDOWN_MS } from "@/lib/signals/cooldown";
import { refreshAccountSignals } from "@/lib/signals/refresh";

export const maxDuration = 120;

/** Bounded batch: the 3 highest-fit accounts that are outside their refresh cooldown (stalest first). */
const BATCH_SIZE = 3;

export async function POST(request: Request) {
  return handle(async () => {
    await requireReviewer(request);
    const db = getDb();
    const cutoff = new Date(Date.now() - REFRESH_COOLDOWN_MS).toISOString();
    const rows = await db
      .select({ id: companies.id })
      .from(companies)
      .where(
        sql`${gte(companies.companyFitScore, 18)} AND coalesce(${companies.accountIntelligence}->>'externalRefreshAt', '') < ${cutoff}`,
      )
      .orderBy(sql`${companies.accountIntelligence}->>'externalRefreshAt' ASC NULLS FIRST`, desc(companies.companyFitScore))
      .limit(BATCH_SIZE);

    const stats = { accounts: 0, discovered: 0, verified: 0, rejected: 0, adapterErrors: 0, skippedByCooldown: rows.length === 0 };
    for (const { id } of rows) {
      const r = await refreshAccountSignals(id);
      stats.accounts++;
      stats.discovered += r.discovered;
      stats.verified += r.verified;
      stats.rejected += r.rejected;
      stats.adapterErrors += r.adapterErrors.length;
    }
    return json(stats);
  });
}
