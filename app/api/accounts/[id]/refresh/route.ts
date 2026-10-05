import { requireReviewer } from "@/lib/auth";
import { HttpError, handle, isUuid, json } from "@/lib/api";
import { getCompany } from "@/lib/db/queries/companies";
import { refreshCooldownRemainingMs } from "@/lib/signals/cooldown";
import { refreshAccountSignals } from "@/lib/signals/refresh";

export const maxDuration = 60;

/** Refresh market signals for one account. Cooldown-protected: provider calls cost credits. */
export async function POST(request: Request, ctx: RouteContext<"/api/accounts/[id]/refresh">) {
  return handle(async () => {
    await requireReviewer(request);
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(400, "Invalid company id");
    const company = await getCompany(id);
    if (!company) throw new HttpError(404, "Account not found");
    const wait = refreshCooldownRemainingMs(company.accountIntelligence?.externalRefreshAt);
    if (wait > 0) {
      throw new HttpError(429, `Intelligence for this account was refreshed recently. Try again in ${Math.ceil(wait / 60_000)} min.`);
    }
    const stats = await refreshAccountSignals(id);
    return json(stats);
  });
}
