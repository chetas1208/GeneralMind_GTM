import "server-only";
import { ACCESS_COOKIE, isOpenDevMode, readAuthConfig, readCookie, readSessionClaims } from "@/lib/access";
import { HttpError } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import { assertSameOrigin } from "@/lib/origin";
import { sessionIsActive } from "@/lib/security/sessions";

const log = createLogger("auth");

/**
 * Server-side authorization for every protected handler. The proxy already gates routes; this
 * re-checks the signed session and that logout has not revoked it.
 * "Reviewer" is the single role: it may source, approve/reject, annotate and push to the CRM.
 */
export async function requireReviewer(request: Request): Promise<void> {
  assertSameOrigin(request);
  if (isOpenDevMode()) return;
  const auth = readAuthConfig();
  if (!auth.configured) throw new HttpError(503, "Access control is not configured on this deployment.");
  const claims = await readSessionClaims(readCookie(request.headers.get("cookie"), ACCESS_COOKIE), auth.secret);
  if (!claims || !(await sessionIsActive(claims.sessionId))) {
    log.warn("unauthorized request", { method: request.method, path: new URL(request.url).pathname });
    throw new HttpError(401, "Unauthorized");
  }
}
