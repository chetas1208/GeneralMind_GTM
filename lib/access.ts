/**
 * Reviewer access control. Web Crypto only, so it runs in both the proxy and route handlers.
 *
 *  - APP_ACCESS_PASSWORD: the shared reviewer password (verified at login, never stored in the cookie).
 *  - AUTH_SECRET: HMAC key that signs the session cookie. Rotating it invalidates every session.
 *
 * Cookie value: `<expiresAtEpochSeconds>.<hex HMAC-SHA256(AUTH_SECRET, "session:" + expiresAt)>`.
 * Production fails CLOSED when either variable is missing.
 */
export const ACCESS_COOKIE = "gm_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type AuthConfig = { configured: true; password: string; secret: string } | { configured: false; missing: string[] };

export function readAuthConfig(env: Record<string, string | undefined> = process.env): AuthConfig {
  const password = env.APP_ACCESS_PASSWORD?.trim();
  const secret = env.AUTH_SECRET?.trim();
  const missing = [!password && "APP_ACCESS_PASSWORD", !secret && "AUTH_SECRET"].filter(Boolean) as string[];
  if (missing.length || !password || !secret) return { configured: false, missing };
  return { configured: true, password, secret };
}

/** Local development without credentials is open; anything else (production, preview) must be configured. */
export function isOpenDevMode(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== "production" && !env.VERCEL && !readAuthConfig(env).configured;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SessionClaims = { sessionId: string; expiresAt: number };

/**
 * Cookie value: `<sessionId>.<expiresAt>.<hex HMAC(AUTH_SECRET, "session:" + id + ":" + exp)>`.
 * The id is random and stored server-side, so login always rotates the session and logout can revoke it.
 * A token signed only with an expiry (the previous format) is rejected.
 */
export async function createSessionToken(secret: string, now = Date.now(), sessionId = crypto.randomUUID()): Promise<string> {
  const exp = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  return `${sessionId}.${exp}.${await hmacHex(secret, `session:${sessionId}:${exp}`)}`;
}

export async function readSessionClaims(token: string | undefined, secret: string, now = Date.now()): Promise<SessionClaims | null> {
  if (!token) return null;
  const [sessionId, expRaw, sig, extra] = token.split(".");
  if (!sessionId || !expRaw || !sig || extra !== undefined) return null;
  if (!SESSION_ID.test(sessionId) || !/^\d{1,12}$/.test(expRaw)) return null;
  const expiresAt = Number(expRaw);
  if (expiresAt * 1000 < now) return null;
  const expected = await hmacHex(secret, `session:${sessionId}:${expRaw}`);
  if (!safeEqual(sig, expected)) return null;
  return { sessionId, expiresAt };
}

export async function verifySessionToken(token: string | undefined, secret: string, now = Date.now()): Promise<boolean> {
  return (await readSessionClaims(token, secret, now)) !== null;
}

/** Constant-time comparison of two secrets (digests are compared so length is not leaked). */
export async function passwordMatches(candidate: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([hmacHex("pw-compare", candidate), hmacHex("pw-compare", expected)]);
  return safeEqual(a, b);
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0 && part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}
