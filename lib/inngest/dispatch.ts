import "server-only";
import { getEnv } from "@/lib/env";
import { type RunRow } from "@/lib/db/queries/runs";
import { createLogger } from "@/lib/logger";
import { inngest } from "./client";
import { eventsDiscoveryRequested, sourceEventRequested } from "./events";

const log = createLogger("dispatch");

export function isInngestDispatchConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.INNGEST_EVENT_KEY?.trim() && env.INNGEST_SIGNING_KEY?.trim());
}

export type DispatchResult = { dispatched: boolean; error?: string };

/**
 * Hand a run to Inngest when configured. On failure the run stays queued and the UI poll
 * (`POST /api/runs/:id/tick`) advances it instead — the button still works without Inngest Cloud.
 */
export async function dispatchRun(run: RunRow, requestedBy = "operator"): Promise<DispatchResult> {
  if (!isInngestDispatchConfigured()) {
    log.info("inngest not configured; run will advance via client tick", { runId: run.id });
    return { dispatched: false, error: "Inngest keys not set — advancing from the browser." };
  }
  const dispatchId = crypto.randomUUID();
  const idempotencyKey = `${run.id}:${run.dispatchGeneration ?? 1}`;
  try {
    if (run.kind === "event_discovery") {
      await inngest.send(eventsDiscoveryRequested.create({ runId: run.id, requestedBy, dispatchId, idempotencyKey }));
    } else {
      if (!run.eventId) throw new Error("Sourcing run has no event");
      await inngest.send(sourceEventRequested.create({ runId: run.id, eventId: run.eventId, requestedBy, dispatchId, idempotencyKey }));
    }
    log.info("run dispatched", { runId: run.id, kind: run.kind });
    return { dispatched: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error("dispatch failed; client tick fallback", { runId: run.id, error: message });
    return { dispatched: false, error: message };
  }
}
