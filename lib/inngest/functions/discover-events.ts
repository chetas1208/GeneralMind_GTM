import "server-only";
import { markRunFailed } from "@/lib/db/queries/runs";
import { sanitizeStoredError } from "@/lib/security/errors";
import { inngest } from "../client";
import { driveRun } from "../drive-run";
import { eventsDiscoveryRequested } from "../events";

/** "Discover Events": search → extract candidates → gather participant pages → relevance scoring → auto-select. */
export const discoverEvents = inngest.createFunction(
  {
    id: "discover-events",
    triggers: [eventsDiscoveryRequested],
    retries: 4,
    concurrency: 1,
    idempotency: "event.data.idempotencyKey",
    onFailure: async ({ event, error }) => {
      const runId = (event.data as { event?: { data?: { runId?: string } } }).event?.data?.runId;
      if (runId) await markRunFailed(runId, sanitizeStoredError(error.message));
    },
  },
  async ({ event, step }) => {
    const final = await driveRun(step, event.data.runId);
    return { runId: event.data.runId, status: final.status, stage: final.stage };
  },
);
