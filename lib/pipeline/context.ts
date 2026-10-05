import "server-only";
import type { SourceRunProgress } from "@/lib/db/schema";
import { saveRun, type RunRow } from "@/lib/db/queries/runs";
import { createLogger, type Logger } from "@/lib/logger";

export type RunStageName = RunRow["stage"];
export type StepResult = "continue" | "done";

/** Mutable view of a run that handlers advance one bounded batch at a time. */
export class RunContext {
  readonly log: Logger;
  progress: SourceRunProgress;
  stage: RunStageName;
  counts: Pick<RunRow, "eventsFound" | "companiesFound" | "peopleFound" | "peopleEnriched" | "leadsQualified">;

  constructor(
    readonly run: RunRow,
    readonly deadline: number,
  ) {
    this.log = createLogger("pipeline", { runId: run.id, kind: run.kind, eventId: run.eventId });
    this.progress = {
      steps: run.progress?.steps ?? [],
      cursor: run.progress?.cursor ?? {},
      counters: run.progress?.counters ?? {},
    };
    this.stage = run.stage;
    this.counts = {
      eventsFound: run.eventsFound,
      companiesFound: run.companiesFound,
      peopleFound: run.peopleFound,
      peopleEnriched: run.peopleEnriched,
      leadsQualified: run.leadsQualified,
    };
  }

  get cursor() {
    return this.progress.cursor;
  }
  get counters() {
    return this.progress.counters;
  }

  timeLeft() {
    return this.deadline - Date.now();
  }

  setStage(stage: RunStageName) {
    this.stage = stage;
  }

  note(message: string, level: "info" | "warn" | "error" = "info") {
    this.progress.steps.push({ at: new Date().toISOString(), stage: this.stage, message, level });
    if (this.progress.steps.length > 200) this.progress.steps = this.progress.steps.slice(-200);
    if (level === "error") this.log.error(message, { stage: this.stage });
    else if (level === "warn") this.log.warn(message, { stage: this.stage });
    else this.log.info(message, { stage: this.stage });
  }

  /** Persist everything. Called after each bounded batch so no work is lost. */
  async save(extra: Partial<Pick<RunRow, "status" | "error" | "completedAt">> & { releaseLease?: boolean } = {}) {
    await saveRun(this.run.id, {
      stage: this.stage,
      ...this.counts,
      progress: this.progress,
      ...extra,
    });
  }
}

export type StepHandler = (ctx: RunContext) => Promise<StepResult>;
