import { and, eq } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { signals } from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";
import type { SignalStatus, VerifiedSignal } from "./types";

type Db = NeonHttpDatabase<typeof schema>;

export async function upsertSignalWithDb(db: Db, companyId: string, v: VerifiedSignal): Promise<"created" | "updated" | "skipped"> {
  const [existing] = await db
    .select({ id: signals.id })
    .from(signals)
    .where(and(eq(signals.companyId, companyId), eq(signals.dedupeKey, v.dedupeKey)))
    .limit(1);

  const row = {
    companyId,
    personId: v.personId ?? null,
    eventId: v.eventId ?? null,
    eventLeadId: v.eventLeadId ?? null,
    type: v.type,
    direction: v.direction ?? "positive",
    status: "verified" as SignalStatus,
    title: v.title,
    summary: v.summary,
    occurredAt: v.occurredAt ?? null,
    expiresAt: v.expiresAt ?? null,
    sourceUrl: v.sourceUrl,
    sourceTitle: v.sourceTitle ?? null,
    evidenceText: v.evidenceText ?? null,
    confidence: v.confidence,
    relevance: v.relevance,
    urgency: v.urgency,
    workflowHints: v.workflowHints ?? [],
    dedupeKey: v.dedupeKey,
    metadata: v.metadata ?? {},
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(signals).set(row).where(eq(signals.id, existing.id));
    return "updated";
  }
  await db.insert(signals).values(row);
  return "created";
}
