import "server-only";
import { getEvent } from "@/lib/db/queries/events";
import type { RunContext, StepResult } from "./context";
import { runAnnouncementsStage } from "./stages/announcements";
import { runCompaniesStage } from "./stages/companies";
import { runDiscoverStage, runExtractStage } from "./stages/extract";
import { runEnrichStage } from "./stages/enrich";
import { runPeopleStage } from "./stages/people";
import { runExplainStage, runScoreStage } from "./stages/score";

type Stage = "discover" | "extract" | "companies" | "people" | "announcements" | "enrich" | "score" | "explain";
const ORDER: Stage[] = ["discover", "extract", "companies", "people", "announcements", "enrich", "score", "explain"];

/**
 * Event → evidence → companies → people → enrichment → deterministic score → explanation.
 * Each call performs ONE bounded batch of the first unfinished stage and persists progress.
 */
export async function sourcingStep(ctx: RunContext): Promise<StepResult> {
  if (!ctx.run.eventId) throw new Error("Sourcing run has no event");
  const event = await getEvent(ctx.run.eventId);
  if (!event) throw new Error("Event no longer exists");

  const done = (ctx.cursor.stagesDone ??= []);
  const next = ORDER.find((s) => !done.includes(s));
  if (!next) return "done";

  let finished: boolean;
  switch (next) {
    case "discover":
      finished = await runDiscoverStage(ctx, event);
      break;
    case "extract":
      finished = await runExtractStage(ctx, event);
      break;
    case "companies":
      finished = await runCompaniesStage(ctx, event);
      break;
    case "people":
      finished = await runPeopleStage(ctx, event);
      break;
    case "announcements":
      finished = await runAnnouncementsStage(ctx, event);
      break;
    case "enrich":
      finished = await runEnrichStage(ctx, event);
      break;
    case "score":
      finished = await runScoreStage(ctx, event);
      break;
    case "explain":
      finished = await runExplainStage(ctx, event);
      break;
  }
  if (finished) done.push(next);
  if (done.length >= ORDER.length) {
    const { syncEventSignalsForEvent } = await import("@/lib/signals/sync-events");
    await syncEventSignalsForEvent(event.id);
    ctx.note("Account signals updated from event intelligence");
  }
  return done.length >= ORDER.length ? "done" : "continue";
}
