import { HttpError, handle, isUuid, json } from "@/lib/api";
import { listRunsForEvent } from "@/lib/db/queries/runs";

export async function GET(_req: Request, ctx: RouteContext<"/api/events/[id]/source-runs">) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid event id");
    return json({ runs: await listRunsForEvent(id) });
  });
}
