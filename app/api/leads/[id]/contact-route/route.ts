import { revalidatePath } from "next/cache";
import { HttpError, handle, isUuid, json } from "@/lib/api";
import { requireReviewer } from "@/lib/auth";
import { resolveContactRoute } from "@/lib/services/contact-route";
import { applyGuessedEmailForLead } from "@/lib/services/guessed-email";

export const maxDuration = 60;

/** Find a verified public profile and/or apply an unverified pattern email guess when domain is known. */
export async function POST(request: Request, ctx: RouteContext<"/api/leads/[id]/contact-route">) {
  return handle(async () => {
    await requireReviewer(request);
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid lead id");
    const result = await resolveContactRoute(id);
    if (!result) throw new HttpError(404, "Lead not found");
    const guess = await applyGuessedEmailForLead(id);
    if (result.status === "found" || guess.applied) revalidatePath(`/leads/${id}`);
    return json({ ...result, guessedEmail: guess.applied ? guess.email : null });
  });
}
