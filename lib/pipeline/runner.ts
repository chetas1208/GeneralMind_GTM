import "server-only";
import { acquireLease, createRun, finalizeRunCancelled, findActiveRun, getRun, getRunStatus, reclaimStaleActiveRun, type RunRow } from "@/lib/db/queries/runs";
import { sanitizeStoredError } from "@/lib/security/errors";
import { createLogger } from "@/lib/logger";
import { RunContext, type StepHandler } from "./context";
import { discoveryStep } from "./discovery";
import { sourcingStep } from "./sourcing";

const log = createLogger("runner");

/** Do not start a new batch with less than this left in the tick budget. */
const MIN_STEP_MS = 14_000;

function handlerFor(run: RunRow): StepHandler {
  return run.kind === "event_discovery" ? discoveryStep : sourcingStep;
}

/** Create (or return the already-active) run. Idempotent per event + kind. */
export async function startRun(input: { eventId: string | null; kind: "lead_sourcing" | "event_discovery" }) {
  await reclaimStaleActiveRun(input.eventId, input.kind);
  const active = await findActiveRun(input.eventId, input.kind);
  if (active) return { run: active, created: false };
  const run = await createRun(input);
  log.info("run created", { runId: run.id, kind: run.kind, eventId: run.eventId });
  return { run, created: true };
}

export const isActive = (run: Pick<RunRow, "status">) => run.status === "queued" || run.status === "running" || run.status === "cancel_requested";

/**
 * Advance a run by as many bounded batches as fit in `budgetMs`, persisting the cursor after each
 * batch. Invoked by a durable Inngest step (see lib/inngest). Only the lease holder processes.
 *
 * With `rethrow`, an unexpected error is NOT recorded as a terminal failure: progress is saved, the
 * lease is released and the error propagates so the durable step can retry exactly the batch that
 * failed (nothing already persisted is redone).
 */
export async function tickRun(runId: string, opts: { budgetMs?: number; rethrow?: boolean } = {}): Promise<RunRow | null> {
  const budgetMs = opts.budgetMs ?? 42_000;
  const leased = await acquireLease(runId, budgetMs + 20_000);
  if (!leased) {
    // A cancel-requested run is never leased again; whoever ticks next finalizes it once no worker holds the lease or timeout has passed.
    const current = await getRun(runId);
    if (current?.status === "cancel_requested") {
      const leaseExpired = !(current.leaseUntil && current.leaseUntil.getTime() > Date.now());
      const ageMs = current.updatedAt ? Date.now() - new Date(current.updatedAt).getTime() : 0;
      if (leaseExpired || ageMs > 15_000) {
        await finalizeRunCancelled(runId);
        return getRun(runId);
      }
    }
    return current;
  }

  const ctx = new RunContext(leased, Date.now() + budgetMs);
  const handler = handlerFor(leased);

  try {
    for (;;) {
      // Cooperative cancellation: re-read durable state before every batch so a stop request lands within one batch.
      if ((await getRunStatus(runId)) === "cancel_requested") {
        await ctx.save();
        await finalizeRunCancelled(runId);
        break;
      }
      const result = await handler(ctx);
      if (result === "done") {
        ctx.setStage("complete");
        ctx.note("Run complete");
        await ctx.save({ status: "complete", completedAt: new Date(), error: null, releaseLease: true });
        break;
      }
      await ctx.save();
      if ((await getRunStatus(runId)) === "cancel_requested") {
        await finalizeRunCancelled(runId);
        break;
      }
      if (ctx.timeLeft() < MIN_STEP_MS) {
        await ctx.save({ releaseLease: true });
        break;
      }
    }
  } catch (e) {
    const message = sanitizeStoredError(e instanceof Error ? e.message : String(e));
    if (opts.rethrow) {
      ctx.note(`Step hit an error and will be retried: ${message}`.slice(0, 400), "warn");
      await ctx.save({ releaseLease: true }).catch(() => undefined);
      throw e;
    }
    ctx.setStage("failed");
    ctx.note(`Run failed: ${message}`, "error");
    await ctx.save({ status: "failed", error: message.slice(0, 1_000), completedAt: new Date(), releaseLease: true });
  }
  return getRun(runId);
}
