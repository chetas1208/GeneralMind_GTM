import { z } from "zod";
import { revalidatePath } from "next/cache";
import { HttpError, handle, isUuid, json, readJson } from "@/lib/api";
import { getLeadDetail } from "@/lib/db/queries/leads";
import { editLead } from "@/lib/services/review";

export async function GET(_req: Request, ctx: RouteContext<"/api/leads/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid lead id");
    const detail = await getLeadDetail(id);
    if (!detail) throw new HttpError(404, "Lead not found");
    return json(detail);
  });
}

const editSchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  email: z.string().trim().email().max(200).optional(),
  notes: z.string().trim().max(2_000).optional(),
});

/** Manual correction of title / email with an audit entry. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/leads/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid lead id");
    const body = editSchema.parse(await readJson(request));
    const detail = await editLead(id, body);
    revalidatePath(`/leads/${id}`);
    return json(detail);
  });
}
