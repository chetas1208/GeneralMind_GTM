import { handle, json } from "@/lib/api";
import { getDb } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { desc, gte } from "drizzle-orm";
import { refreshAccountSignals } from "@/lib/signals/refresh";

/** Refresh intelligence for top-fit accounts (bounded batch). */
export async function POST() {
  return handle(async () => {
    const db = getDb();
    const rows = await db
      .select({ id: companies.id })
      .from(companies)
      .where(gte(companies.companyFitScore, 18))
      .orderBy(desc(companies.companyFitScore))
      .limit(8);

    const stats = { accounts: 0, verified: 0, rejected: 0 };
    for (const { id } of rows) {
      const r = await refreshAccountSignals(id);
      stats.accounts++;
      stats.verified += r.verified;
      stats.rejected += r.rejected;
    }
    return json(stats);
  });
}
