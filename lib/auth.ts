import "server-only";
import { ACCESS_COOKIE, isOpenDevMode, readAuthConfig, readCookie, verifySessionToken } from "@/lib/access";
import { HttpError } from "@/lib/api";

/**
 * Server-side authorization for mutations. The proxy already gates every route; this re-checks inside the
 * handler so a mutation can never run unauthenticated even if routing/matcher configuration changes.
 * "Reviewer" is the single role: it may source, approve/reject, annotate and push to the CRM.
 */
export async function requireReviewer(request: Request): Promise<void> {
  if (isOpenDevMode()) return;
  const auth = readAuthConfig();
  if (!auth.configured) throw new HttpError(503, "Access control is not configured on this deployment.");
  const token = readCookie(request.headers.get("cookie"), ACCESS_COOKIE);
  if (!(await verifySessionToken(token, auth.secret))) throw new HttpError(401, "Unauthorized");
}
