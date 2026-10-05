import "server-only";
import { getDb } from "@/lib/db";
import { rebuildSignalClustersWithDb } from "./cluster-db";

export async function rebuildSignalClusters(companyId: string): Promise<number> {
  return rebuildSignalClustersWithDb(getDb(), companyId);
}
