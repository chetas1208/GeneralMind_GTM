import "server-only";
import { and, desc, eq, inArray, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { sanitizeStoredError } from "@/lib/security/errors";
import { getDb } from "@/lib/db";
import { sourceRuns, type SourceRunProgress } from "@/lib/db/schema";

export type RunRow = typeof sourceRuns.$inferSelect;

/** Statuses in which a run still owns its event slot (blocks duplicate runs). */
export const ACTIVE_STATUSES: RunRow["status"][] = ["queued", "running", "cancel_requested"];
export const TERMINAL_STATUSES: RunRow["status"][] = ["complete", "failed", "cancelled"];
export const isTerminal = (status: RunRow["status"]) => TERMINAL_STATUSES.includes(status);

export const emptyProgress = (): SourceRunProgress => ({ steps: [], cursor: {}, counters: {} });

export async function createRun(input: { eventId: string | null; kind: "lead_sourcing" | "event_discovery" }): Promise<RunRow> {
  const [row] = await getDb()
    .insert(sourceRuns)
    .values({ eventId: input.eventId, kind: input.kind, progress: emptyProgress() })
    .returning();
  return row;
}

export async function getRun(id: string): Promise<RunRow | null> {
  const [r] = await getDb().select().from(sourceRuns).where(eq(sourceRuns.id, id)).limit(1);
  return r ?? null;
}

const STALE_RUNNING_MS = 15 * 60 * 1000;

/**
 * Free a slot held by a run the worker no longer drives.
 * Queued with no progress, or running whose lease expired and whose heartbeat (updatedAt) is old.
 */
export async function reclaimStaleActiveRun(eventId: string | null, kind: "lead_sourcing" | "event_discovery"): Promise<void> {
  const active = await findActiveRun(eventId, kind);
  if (!active) return;
  const ageMs = Date.now() - new Date(active.updatedAt).getTime();
  if (active.status === "queued") {
    const noProgress = !(active.progress?.steps?.length);
    const stuck = (noProgress && ageMs > 90_000) || ageMs > 600_000;
    if (!stuck) return;
    await markRunFailed(active.id, "Previous run was stuck waiting for the job runner. It was reset — click Discover events again.");
    return;
  }
  const leaseExpired = !active.leaseUntil || active.leaseUntil.getTime() < Date.now();
  if (active.status === "cancel_requested") {
    if (leaseExpired || ageMs > 20_000) {
      await finalizeRunCancelled(active.id);
      return;
    }
  }
  if (active.status === "running" && leaseExpired && ageMs > STALE_RUNNING_MS) {
    await markRunFailed(active.id, "Previous run stopped making progress and was reset. Start it again.");
  }
}

/** Active (queued/running) run for an event + kind, if any – prevents duplicate concurrent runs. */
export async function findActiveRun(eventId: string | null, kind: "lead_sourcing" | "event_discovery"): Promise<RunRow | null> {
  const [r] = await getDb()
    .select()
    .from(sourceRuns)
    .where(
      and(
        eventId ? eq(sourceRuns.eventId, eventId) : isNull(sourceRuns.eventId),
        eq(sourceRuns.kind, kind),
        inArray(sourceRuns.status, ACTIVE_STATUSES),
      ),
    )
    .orderBy(desc(sourceRuns.createdAt))
    .limit(1);
  return r ?? null;
}

export async function listRunsForEvent(eventId: string, limit = 10): Promise<RunRow[]> {
  return getDb().select().from(sourceRuns).where(eq(sourceRuns.eventId, eventId)).orderBy(desc(sourceRuns.createdAt)).limit(limit);
}

export async function listRecentRuns(limit = 20): Promise<RunRow[]> {
  return getDb().select().from(sourceRuns).orderBy(desc(sourceRuns.createdAt)).limit(limit);
}

export async function listActiveRuns(): Promise<RunRow[]> {
  return getDb().select().from(sourceRuns).where(inArray(sourceRuns.status, ACTIVE_STATUSES)).orderBy(desc(sourceRuns.createdAt));
}

/**
 * Atomically take the processing lease. Returns the run only if this caller won it,
 * so overlapping ticks (a retried step and its predecessor) never process the same run concurrently.
 */
export async function acquireLease(id: string, leaseMs: number): Promise<RunRow | null> {
  const until = new Date(Date.now() + leaseMs);
  const [row] = await getDb()
    .update(sourceRuns)
    .set({ leaseUntil: until, status: "running", startedAt: sql`coalesce(${sourceRuns.startedAt}, now())`, updatedAt: new Date() })
    .where(
      and(
        eq(sourceRuns.id, id),
        inArray(sourceRuns.status, ["queued", "running"]),
        or(isNull(sourceRuns.leaseUntil), lt(sourceRuns.leaseUntil, new Date())),
      ),
    )
    .returning();
  return row ?? null;
}

export async function saveRun(
  id: string,
  patch: Partial<Pick<RunRow, "status" | "stage" | "eventsFound" | "companiesFound" | "peopleFound" | "peopleEnriched" | "leadsQualified" | "error" | "completedAt">> & {
    progress?: SourceRunProgress;
    releaseLease?: boolean;
  },
): Promise<void> {
  const { releaseLease, ...rest } = patch;
  // A terminal run is final: a late worker save must never resurrect or overwrite it.
  await getDb()
    .update(sourceRuns)
    .set({ ...rest, ...(releaseLease ? { leaseUntil: null } : {}), updatedAt: new Date() })
    .where(and(eq(sourceRuns.id, id), notInArray(sourceRuns.status, TERMINAL_STATUSES)));
}

/** Mark a run failed with a real error message (used when the job provider gives up or cannot be reached). */
export async function markRunFailed(id: string, message: string): Promise<void> {
  const run = await getRun(id);
  if (!run || isTerminal(run.status)) return;
  const safe = sanitizeStoredError(message);
  const progress = run.progress ?? emptyProgress();
  progress.steps.push({ at: new Date().toISOString(), stage: run.stage, message: `Run failed: ${safe}`.slice(0, 500), level: "error" });
  await getDb()
    .update(sourceRuns)
    .set({ status: "failed", stage: "failed", error: safe, completedAt: new Date(), leaseUntil: null, progress, updatedAt: new Date() })
    .where(and(eq(sourceRuns.id, id), inArray(sourceRuns.status, ACTIVE_STATUSES)));
}

/** Cheap status probe used by workers between batches (reads durable state, never process memory). */
export async function getRunStatus(id: string): Promise<RunRow["status"] | null> {
  const [r] = await getDb().select({ status: sourceRuns.status }).from(sourceRuns).where(eq(sourceRuns.id, id)).limit(1);
  return r?.status ?? null;
}

/**
 * Move a run to the terminal `cancelled` state: status, stage, completedAt set, lease released, collected
 * counters and cursor preserved. Idempotent and race-safe: only an active run transitions, so a run that
 * already completed, failed or was cancelled keeps its state. `progress` lets a worker pass its in-memory
 * progress so the last batch it finished is not lost.
 */
export async function finalizeRunCancelled(id: string, progress?: SourceRunProgress): Promise<void> {
  const run = await getRun(id);
  if (!run || isTerminal(run.status)) return;
  const next = progress ?? run.progress ?? emptyProgress();
  next.steps.push({ at: new Date().toISOString(), stage: run.stage, message: "Run cancelled. Everything collected so far is kept.", level: "warn" });
  const now = new Date();
  await getDb()
    .update(sourceRuns)
    .set({ status: "cancelled", stage: "cancelled", completedAt: now, leaseUntil: null, progress: next, updatedAt: now })
    .where(and(eq(sourceRuns.id, id), inArray(sourceRuns.status, ACTIVE_STATUSES)));
}

/**
 * Ask a run to stop. A run that has not started (or whose lease has lapsed) is cancelled at once;
 * otherwise it is flagged and the workflow stops at the next stage boundary.
 */
export async function requestCancel(id: string): Promise<RunRow | null> {
  const run = await getRun(id);
  if (!run || isTerminal(run.status)) return run;
  const leaseHeld = run.leaseUntil && run.leaseUntil.getTime() > Date.now();
  if (run.status === "queued" || !leaseHeld || run.status === "cancel_requested") {
    await finalizeRunCancelled(id);
  } else {
    await getDb().update(sourceRuns).set({ status: "cancel_requested", updatedAt: new Date() }).where(and(eq(sourceRuns.id, id), eq(sourceRuns.status, "running")));
  }
  return getRun(id);
}

/** Re-open a failed/cancelled run, keeping its cursor and collected data, so a retry resumes where it stopped. */
export async function reopenRun(id: string): Promise<RunRow | null> {
  const [row] = await getDb()
    .update(sourceRuns)
    .set({
      status: "queued",
      stage: "queued",
      error: null,
      completedAt: null,
      leaseUntil: null,
      dispatchGeneration: sql`${sourceRuns.dispatchGeneration} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(sourceRuns.id, id), inArray(sourceRuns.status, ["failed", "cancelled"])))
    .returning();
  return row ?? null;
}
