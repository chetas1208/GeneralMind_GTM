import { revalidatePath } from "next/cache";
import { requireReviewer } from "@/lib/auth";
import { HttpError, handle, isUuid, json, readJson } from "@/lib/api";
import { deleteEvent, eventDedupeKey, getEvent, listEventSources, updateEvent } from "@/lib/db/queries/events";
import { eventPatchSchema } from "@/lib/events/schemas";
import { normalizeUrl } from "@/lib/text";

export async function GET(_req: Request, ctx: RouteContext<"/api/events/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid event id");
    const event = await getEvent(id);
    if (!event) throw new HttpError(404, "Event not found");
    return json({ event, sources: await listEventSources(id) });
  });
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/events/[id]">) {
  return handle(async () => {
    await requireReviewer(request);
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid event id");
    const patch = eventPatchSchema.parse(await readJson(request));
    const extra: Record<string, unknown> = {};
    if (patch.websiteUrl !== undefined) {
      const url = normalizeUrl(patch.websiteUrl);
      extra.websiteUrl = url;
      extra.dedupeKey = eventDedupeKey(url);
    }
    const updated = await updateEvent(id, { ...patch, ...extra });
    if (!updated) throw new HttpError(404, "Event not found");
    revalidatePath("/radar");
    return json({ event: updated });
  });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/events/[id]">) {
  return handle(async () => {
    await requireReviewer(request);
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid event id");
    await deleteEvent(id);
    revalidatePath("/radar");
    return json({ ok: true });
  });
}
