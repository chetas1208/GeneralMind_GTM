import { HttpError, handle, isUuid, json } from "@/lib/api";
import { requestCancel } from "@/lib/db/queries/runs";

/** Ask a run to stop. It halts at the next stage boundary; collected data is kept. */
export async function POST(_req: Request, ctx: RouteContext<"/api/runs/[id]/cancel">) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid run id");
    const run = await requestCancel(id);
    if (!run) throw new HttpError(404, "Run not found");
    return json({ run });
  });
}
