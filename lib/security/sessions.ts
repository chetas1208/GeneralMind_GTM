import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { createSessionToken, readSessionClaims, SESSION_TTL_SECONDS } from "@/lib/access";
import { getDb } from "@/lib/db";
import { reviewerSessions } from "@/lib/db/schema";

/** Insert a new server-side session and return the cookie value. Login always calls this, so the id rotates. */
export async function openReviewerSession(secret: string): Promise<string> {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await getDb().insert(reviewerSessions).values({ id, expiresAt });
  return createSessionToken(secret, Date.now(), id);
}

/** True only when the signed id still exists, is unexpired, and has not been revoked. */
export async function sessionIsActive(sessionId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: reviewerSessions.id })
    .from(reviewerSessions)
    .where(and(eq(reviewerSessions.id, sessionId), isNull(reviewerSessions.revokedAt), gt(reviewerSessions.expiresAt, new Date())))
    .limit(1);
  return Boolean(row);
}

/** Logout. Unknown or already-expired tokens are a no-op. */
export async function revokeSessionToken(token: string | undefined, secret: string): Promise<void> {
  const claims = await readSessionClaims(token, secret);
  if (!claims) return;
  await getDb().update(reviewerSessions).set({ revokedAt: new Date() }).where(eq(reviewerSessions.id, claims.sessionId));
}
