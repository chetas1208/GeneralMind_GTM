import "server-only";
import { markRunFailed } from "@/lib/db/queries/runs";
import { sanitizeStoredError } from "@/lib/security/errors";
import { inngest } from "../client";
import { driveRun } from "../drive-run";
import { sourceEventRequested } from "../events";

/**
 * "Source Leads" for one event: evidence discovery → participants → companies → people →
 * attendance verification → enrichment → deterministic scoring → explanation.
 * The stage logic lives in lib/pipeline; this function makes each batch a durable, retryable step.
 */
export const sourceEvent = inngest.createFunction(
  {
    id: "source-event",
    triggers: [sourceEventRequested],
    retries: 4,
    concurrency: 2, // be kind to Exa / Firecrawl / Apollo / NVIDIA rate limits
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
