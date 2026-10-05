import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { eventCompanies } from "@/lib/db/schema";
import { refreshAccountSignals } from "./refresh";

export async function syncEventSignalsForEvent(eventId: string): Promise<number> {
  const db = getDb();
  const companyIds = await db.select({ id: eventCompanies.companyId }).from(eventCompanies).where(eq(eventCompanies.eventId, eventId));
  let n = 0;
  for (const { id } of companyIds) {
    await refreshAccountSignals(id, { adapters: ["event"] });
    n++;
  }
  return n;
}
