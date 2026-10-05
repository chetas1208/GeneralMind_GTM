import "server-only";
import { getEvent } from "@/lib/db/queries/events";
import { assessEvent, ensureOverviewContent, gatherEventSources } from "@/lib/events/service";
import { inngest } from "../client";
import { eventAssessRequested } from "../events";

/** After an operator adds an event by hand: gather its participant pages, then score its relevance. */
export const assessEventFn = inngest.createFunction(
  { id: "assess-event", triggers: [eventAssessRequested], retries: 3, concurrency: 2 },
  async ({ event, step }) => {
    const { eventId } = event.data;
    await step.run("gather-sources", async () => {
      if (!(await getEvent(eventId))) return { skipped: true };
      const g = await gatherEventSources(eventId);
      await ensureOverviewContent(eventId);
      return { stored: g.stored };
    });
    return step.run("assess-relevance", async () => {
      const res = await assessEvent(eventId);
      return res.ok ? { score: res.score } : { error: res.error };
    });
  },
);
