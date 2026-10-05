import { revalidatePath } from "next/cache";
import { HttpError, handle, isUuid, json } from "@/lib/api";
import { pushLeadToHubspot } from "@/lib/services/review";

export const maxDuration = 60;

/** Push an APPROVED lead to HubSpot (company + contact upsert + association). Never automatic. */
export async function POST(_req: Request, ctx: RouteContext<"/api/leads/[id]/hubspot">) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid lead id");
    const result = await pushLeadToHubspot(id);
    revalidatePath("/leads");
    revalidatePath(`/leads/${id}`);
    revalidatePath("/pipeline");
    return json(result);
  });
}
