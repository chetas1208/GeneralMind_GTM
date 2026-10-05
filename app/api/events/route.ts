import { handle, json, readJson } from "@/lib/api";
import { requireReviewer } from "@/lib/auth";
import { createEvent, eventDedupeKey, findEventByDedupeKey, listEvents } from "@/lib/db/queries/events";
import { eventInputSchema } from "@/lib/events/schemas";
import { inngest } from "@/lib/inngest/client";
import { eventAssessRequested } from "@/lib/inngest/events";
import { normalizeUrl } from "@/lib/text";

export async function GET(request: Request) {
  return handle(async () => {
    const status = new URL(request.url).searchParams.get("status");
    const statuses = status ? (status.split(",") as ("discovered" | "selected" | "rejected" | "archived")[]) : undefined;
    return json({ events: await listEvents({ statuses }) });
  });
}

/** Manually add an event; source gathering and relevance assessment run as a durable job. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireReviewer(request);
    const input = eventInputSchema.parse(await readJson(request));
    const websiteUrl = normalizeUrl(input.websiteUrl);
    const dedupeKey = eventDedupeKey(websiteUrl);
    if (dedupeKey && (await findEventByDedupeKey(dedupeKey))) {
      return json({ error: "An event with this website already exists" }, { status: 409 });
    }
    const event = await createEvent({ ...input, websiteUrl, registrationUrl: normalizeUrl(input.registrationUrl), dedupeKey, sourceUrl: websiteUrl });
    let assessment: "queued" | "not_started" = "not_started";
    if (websiteUrl) {
      try {
        await inngest.send(eventAssessRequested.create({ eventId: event.id, requestedBy: "operator" }));
        assessment = "queued";
      } catch {
        // The event itself is saved; the operator can run "Re-analyze" later. Report honestly.
      }
    }
    return json({ event, assessment }, { status: 201 });
  });
}
