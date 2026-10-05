import { revalidatePath } from "next/cache";
import { HttpError, handle, isUuid, json } from "@/lib/api";
import { requireReviewer } from "@/lib/auth";
import { resolveContactRoute } from "@/lib/services/contact-route";

export const maxDuration = 60;

/** Find a verified public profile for the lead's contact. Never guesses a profile or email. */
export async function POST(request: Request, ctx: RouteContext<"/api/leads/[id]/contact-route">) {
  return handle(async () => {
    await requireReviewer(request);
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid lead id");
    const result = await resolveContactRoute(id);
    if (!result) throw new HttpError(404, "Lead not found");
    if (result.status === "found") revalidatePath(`/leads/${id}`);
    return json(result);
  });
}
