import { HttpError, handle, isUuid, json } from "@/lib/api";
import { requireReviewer } from "@/lib/auth";
import { getEvent } from "@/lib/db/queries/events";
import { dispatchRun } from "@/lib/inngest/dispatch";
import { startRun } from "@/lib/pipeline/runner";

/**
 * "Source Leads": validate the event, create a source run, enqueue the durable workflow and return
 * immediately. If the event already has an active run, that run is returned instead of a duplicate.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/events/[id]/source">) {
  return handle(async () => {
    await requireReviewer(request);
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid event id");
    const event = await getEvent(id);
    if (!event) throw new HttpError(404, "Event not found");
    const { run, created } = await startRun({ eventId: id, kind: "lead_sourcing" });
    const dispatch = created ? await dispatchRun(run) : { dispatched: true };
    return json({ run, alreadyActive: !created, dispatch }, { status: created ? 202 : 200 });
  });
}
