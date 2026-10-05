import "server-only";
import { getDb } from "@/lib/db";
import { upsertSignalWithDb } from "./persist-db";
import type { VerifiedSignal } from "./types";

export async function upsertSignal(companyId: string, v: VerifiedSignal): Promise<"created" | "updated" | "skipped"> {
  return upsertSignalWithDb(getDb(), companyId, v);
}
