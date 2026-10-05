import { handle, isUuid, json } from "@/lib/api";
import { refreshAccountSignals } from "@/lib/signals/refresh";

export async function POST(_req: Request, ctx: RouteContext<"/api/accounts/[id]/refresh">) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new Error("Invalid company id");
    const stats = await refreshAccountSignals(id);
    return json(stats);
  });
}
