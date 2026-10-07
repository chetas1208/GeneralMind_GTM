import "server-only";
import { NonRetriableError, type step as StepTools } from "inngest";
import { ConfigError } from "@/lib/env";
import { IntegrationError } from "@/lib/http";
import { getRun, isTerminal, finalizeRunCancelled } from "@/lib/db/queries/runs";
import { tickRun } from "@/lib/pipeline/runner";

type Step = typeof StepTools;
type Snapshot = { status: string; stage: string; waiting?: boolean };

/** One durable step runs at most this long (it must fit a single serverless invocation). */
const STEP_BUDGET_MS = 40_000;
/** Safety valve: ~80 minutes of work for a single run. */
const MAX_ADVANCES = 120;

/** Errors that will never succeed on retry. Everything else (network, 429, 5xx, DB blips) is retried. */
function isPermanent(e: unknown): boolean {
  if (e instanceof ConfigError) return true;
  if (e instanceof IntegrationError) return !e.retryable;
  return false;
}

async function advance(runId: string): Promise<Snapshot> {
  const run = await getRun(runId);
  if (!run) throw new NonRetriableError(`Run ${runId} does not exist`);
  if (isTerminal(run.status)) return { status: run.status, stage: run.stage };
  // Cancellation is honoured at the boundary between durable steps, never mid-request.
  if (run.status === "cancel_requested") {
    await finalizeRunCancelled(runId);
    return { status: "cancelled", stage: "cancelled" };
  }

  let after;
  try {
    after = await tickRun(runId, { budgetMs: STEP_BUDGET_MS, rethrow: true });
  } catch (e) {
    if (isPermanent(e)) throw new NonRetriableError(e instanceof Error ? e.message : String(e), { cause: e });
    throw e; // retried by Inngest with backoff; the persisted cursor means only the failed batch repeats
  }
  if (!after) throw new NonRetriableError(`Run ${runId} disappeared`);
  const otherWorkerHoldsLease = !isTerminal(after.status) && !!after.leaseUntil && after.leaseUntil.getTime() > Date.now();
  return { status: after.status, stage: after.stage, waiting: otherWorkerHoldsLease };
}

/**
 * Drive a resumable source run to completion as a chain of durable steps. Each step id carries the
 * stage it started in, so the Inngest history reads "advance-qualifying-3". Progress, cursors and
 * collected data live in Neon; step outputs are tiny snapshots. A failed step is retried on its own
 * — completed steps (and the data they persisted) are never redone.
 */
export async function driveRun(step: Step, runId: string): Promise<Snapshot> {
  let last: Snapshot = await step.run("load-run", async () => {
    const run = await getRun(runId);
    if (!run) throw new NonRetriableError(`Run ${runId} does not exist`);
    return { status: run.status, stage: run.stage };
  });

  for (let i = 0; i < MAX_ADVANCES && !isTerminal(last.status as never); i++) {
    last = await step.run(`advance-${last.stage}-${i}`, () => advance(runId));
    if (last.waiting) await step.sleep(`wait-for-lease-${i}`, "15s");
  }
  return last;
}
