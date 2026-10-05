import { handle, json } from "@/lib/api";
import { dispatchRun } from "@/lib/inngest/dispatch";
import { startRun } from "@/lib/pipeline/runner";

/** "Discover Events": create (or return the active) run, hand it to the durable job runner, return at once. */
export async function POST() {
  return handle(async () => {
    const { run, created } = await startRun({ eventId: null, kind: "event_discovery" });
    if (created) await dispatchRun(run);
    return json({ run, alreadyActive: !created }, { status: created ? 202 : 200 });
  });
}
