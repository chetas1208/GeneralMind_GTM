import { HttpError, handle, isUuid, json } from "@/lib/api";
import { requireReviewer } from "@/lib/auth";
import { getRun, isTerminal } from "@/lib/db/queries/runs";
import { tickRun } from "@/lib/pipeline/runner";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Advance a run by one bounded batch (browser poll drives progress when Inngest is unavailable). */
export async function POST(request: Request, ctx: RouteContext<"/api/runs/[id]/tick">) {
  return handle(async () => {
    await requireReviewer(request);
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid run id");
    const before = await getRun(id);
    if (!before) throw new HttpError(404, "Run not found");
    if (!isTerminal(before.status)) {
      await tickRun(id, { budgetMs: 38_000 });
    }
    const run = await getRun(id);
    if (!run) throw new HttpError(404, "Run not found");
    return json({ run });
  });
}
