import { HttpError, handle, isUuid, json } from "@/lib/api";
import { requireReviewer } from "@/lib/auth";
import { findActiveRun, getRun, reopenRun } from "@/lib/db/queries/runs";
import { dispatchRun } from "@/lib/inngest/dispatch";

/** Retry a failed/cancelled run. It resumes from its saved cursor; nothing already collected is discarded. */
export async function POST(request: Request, ctx: RouteContext<"/api/runs/[id]/retry">) {
  return handle(async () => {
    await requireReviewer(request);
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid run id");
    const run = await getRun(id);
    if (!run) throw new HttpError(404, "Run not found");
    if (run.status !== "failed" && run.status !== "cancelled") throw new HttpError(409, `Only failed or cancelled runs can be retried (this one is ${run.status})`);
    const active = await findActiveRun(run.eventId, run.kind as "lead_sourcing" | "event_discovery");
    if (active) return json({ run: active, alreadyActive: true });
    const reopened = await reopenRun(id);
    if (!reopened) throw new HttpError(409, "Run changed state; refresh and try again");
    await dispatchRun(reopened);
    return json({ run: reopened }, { status: 202 });
  });
}
