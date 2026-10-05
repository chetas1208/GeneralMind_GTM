import "server-only";
import { getDb } from "@/lib/db";
import { refreshAccountSignalsWithDb, type RefreshStats } from "./refresh-account";
import { updateAccountIntelligenceWithDb } from "./account-intelligence";

export type { RefreshStats };

export async function refreshAccountSignals(companyId: string, opts: { adapters?: string[] } = {}): Promise<RefreshStats> {
  return refreshAccountSignalsWithDb(getDb(), companyId, opts);
}

export async function updateAccountIntelligence(companyId: string): Promise<void> {
  return updateAccountIntelligenceWithDb(getDb(), companyId);
}
