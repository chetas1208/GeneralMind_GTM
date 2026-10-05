import { eq } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { signalClusters, signals } from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";
import { effectiveSignalStrength } from "./scoring";
import type { SignalType } from "./types";

type Db = NeonHttpDatabase<typeof schema>;

export async function rebuildSignalClustersWithDb(db: Db, companyId: string): Promise<number> {
  await db.delete(signalClusters).where(eq(signalClusters.companyId, companyId));

  const rows = await db.select().from(signals).where(eq(signals.companyId, companyId));
  const active = rows.filter((s) => s.status === "verified" || s.status === "candidate");
  const byWorkflow = new Map<string, typeof active>();

  for (const s of active) {
    const hints = s.workflowHints.length ? s.workflowHints : [];
    for (const w of hints) {
      const list = byWorkflow.get(w) ?? [];
      list.push(s);
      byWorkflow.set(w, list);
    }
  }

  let clusters = 0;
  for (const [workflow, list] of byWorkflow) {
    const strengths = list.map((s) =>
      effectiveSignalStrength({
        id: s.id,
        type: s.type as SignalType,
        direction: s.direction,
        confidence: s.confidence,
        relevance: s.relevance,
        urgency: s.urgency,
        workflowHints: s.workflowHints,
        occurredAt: s.occurredAt,
      }),
    );
    // Bonus counts distinct signal types (independent evidence), not article count.
    const distinctTypes = new Set(list.map((s) => s.type)).size;
    const strength = Math.min(100, Math.round(strengths.reduce((a, b) => a + b, 0) / Math.max(1, list.length) + Math.min(15, (distinctTypes - 1) * 5)));
    const confidence = Math.round(list.reduce((a, s) => a + s.confidence, 0) / list.length);
    const urgency = Math.max(...list.map((s) => s.urgency));
    const times = list.map((s) => s.occurredAt ?? s.discoveredAt);
    const first = new Date(Math.min(...times.map((t) => t.getTime())));
    const last = new Date(Math.max(...times.map((t) => t.getTime())));
    const direction = list.some((s) => s.direction === "negative") ? "negative" : "positive";

    await db.insert(signalClusters).values({
      companyId,
      workflow,
      signalIds: list.map((s) => s.id),
      confidence,
      urgency,
      strength,
      direction,
      firstObservedAt: first,
      lastObservedAt: last,
    });
    clusters++;
  }
  return clusters;
}
