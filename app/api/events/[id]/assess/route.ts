import { HttpError, handle, isUuid, json } from "@/lib/api";
import { requireReviewer } from "@/lib/auth";
import { getEvent } from "@/lib/db/queries/events";
import { assessEvent, ensureOverviewContent } from "@/lib/events/service";

export const maxDuration = 60;

/** Re-run the (single-call) relevance assessment for one event. The score is computed by code from categorical ratings. */
export async function POST(request: Request, ctx: RouteContext<"/api/events/[id]/assess">) {
  return handle(async () => {
    await requireReviewer(request);
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid event id");
    if (!(await getEvent(id))) throw new HttpError(404, "Event not found");
    await ensureOverviewContent(id);
    const result = await assessEvent(id);
    if (!result.ok) throw new HttpError(502, `Assessment failed: ${result.error}`);
    return json({ ok: true, score: result.score });
  });
}
