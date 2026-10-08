import { HttpError, handle, isUuid, json } from "@/lib/api";
import { requireReviewer } from "@/lib/auth";
import { getRun } from "@/lib/db/queries/runs";

export async function GET(request: Request, ctx: RouteContext<"/api/runs/[id]">) {
  return handle(async () => {
    await requireReviewer(request);
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid run id");
    let run = await getRun(id);
    if (!run) throw new HttpError(404, "Run not found");
    if (run.status === "cancel_requested") {
      const leaseExpired = !(run.leaseUntil && run.leaseUntil.getTime() > Date.now());
      const ageMs = Date.now() - new Date(run.updatedAt).getTime();
      if (leaseExpired || ageMs > 15_000) {
        const { finalizeRunCancelled } = await import("@/lib/db/queries/runs");
        await finalizeRunCancelled(id);
        run = await getRun(id);
      }
    }
    return json({ run });
  });
}
