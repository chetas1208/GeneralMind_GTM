import { z } from "zod";
import { revalidatePath } from "next/cache";
import { HttpError, handle, isUuid, json, readJson } from "@/lib/api";
import { approveLead } from "@/lib/services/review";

const bodySchema = z.object({ notes: z.string().trim().max(2_000).optional() });

export async function POST(request: Request, ctx: RouteContext<"/api/leads/[id]/approve">) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid lead id");
    const { notes } = bodySchema.parse(await readJson(request));
    const detail = await approveLead(id, notes);
    revalidatePath("/leads");
    revalidatePath("/pipeline");
    return json({ lead: detail.lead });
  });
}
