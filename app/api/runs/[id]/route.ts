import { HttpError, handle, isUuid, json } from "@/lib/api";
import { getRun } from "@/lib/db/queries/runs";

export async function GET(_req: Request, ctx: RouteContext<"/api/runs/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid run id");
    const run = await getRun(id);
    if (!run) throw new HttpError(404, "Run not found");
    return json({ run });
  });
}
