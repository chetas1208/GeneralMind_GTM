import { handle, json } from "@/lib/api";
import { requireReviewer } from "@/lib/auth";
import { dispatchRun } from "@/lib/inngest/dispatch";
import { startRun } from "@/lib/pipeline/runner";

/** "Discover Events": create (or return the active) run, hand it to the durable job runner, return at once. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireReviewer(request);
    const { run, created } = await startRun({ eventId: null, kind: "event_discovery" });
    const dispatch = created ? await dispatchRun(run) : { dispatched: true };
    return json({ run, alreadyActive: !created, dispatch }, { status: created ? 202 : 200 });
  });
}
