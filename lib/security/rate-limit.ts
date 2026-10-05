import "server-only";
import { and, eq, gt, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { loginAttempts } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const log = createLogger("auth");

/** Failures allowed inside the window. A successful login is not counted. The window slides, so there is no permanent lockout. */
export const LOGIN_WINDOW_MS = 10 * 60 * 1000;
export const LOGIN_MAX_FAILURES = 8;

export function loginLimited(failureCount: number): boolean {
  return failureCount >= LOGIN_MAX_FAILURES;
}

/** Hash the client address with the session secret so the table never stores a raw IP. */
export async function loginAttemptKey(request: Request, secret: string): Promise<string> {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${secret}:${ip}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function tooManyLoginFailures(keyHash: string): Promise<boolean> {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  const rows = await getDb()
    .select({ id: loginAttempts.id })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.keyHash, keyHash), gt(loginAttempts.createdAt, since)))
    .limit(LOGIN_MAX_FAILURES);
  return loginLimited(rows.length);
}

export async function recordLoginFailure(keyHash: string): Promise<void> {
  const db = getDb();
  await db.insert(loginAttempts).values({ keyHash });
  await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));
  log.warn("failed login", { keyPrefix: keyHash.slice(0, 8) });
}
