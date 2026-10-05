import { z } from "zod";
import { revalidatePath } from "next/cache";
import { HttpError, handle, isUuid, json, readJson } from "@/lib/api";
import { rejectLead } from "@/lib/services/review";

const bodySchema = z.object({
  reason: z.enum(["not_icp", "wrong_persona", "weak_evidence", "already_in_crm", "bad_timing", "other"]),
  notes: z.string().trim().max(2_000).optional(),
});

export async function POST(request: Request, ctx: RouteContext<"/api/leads/[id]/reject">) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid lead id");
    const { reason, notes } = bodySchema.parse(await readJson(request));
    const detail = await rejectLead(id, reason, notes);
    revalidatePath("/leads");
    revalidatePath("/pipeline");
    return json({ lead: detail.lead });
  });
}
