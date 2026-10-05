import "server-only";
import { HttpError } from "@/lib/api";
import { markRunFailed, type RunRow } from "@/lib/db/queries/runs";
import { createLogger } from "@/lib/logger";
import { inngest } from "./client";
import { eventsDiscoveryRequested, sourceEventRequested } from "./events";

const log = createLogger("dispatch");

/**
 * Hand a freshly created (or reopened) run to the durable workflow engine and return immediately.
 * If the event cannot be delivered we fail the run with the real reason instead of leaving a
 * "queued" run that will never start.
 */
export async function dispatchRun(run: RunRow, requestedBy = "operator"): Promise<void> {
  const dispatchId = crypto.randomUUID();
  try {
    if (run.kind === "event_discovery") {
      await inngest.send(eventsDiscoveryRequested.create({ runId: run.id, requestedBy, dispatchId }));
    } else {
      if (!run.eventId) throw new Error("Sourcing run has no event");
      await inngest.send(sourceEventRequested.create({ runId: run.id, eventId: run.eventId, requestedBy, dispatchId }));
    }
    log.info("run dispatched", { runId: run.id, kind: run.kind });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error("dispatch failed", { runId: run.id, error: message });
    await markRunFailed(run.id, `Could not hand the run to the job runner: ${message}`);
    throw new HttpError(502, `Could not start the background job: ${message}`);
  }
}
