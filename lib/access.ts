/**
 * Shared-password gate. Dependency-free (Web Crypto only) so it runs in both the proxy and route handlers.
 * The cookie value is an HMAC of a fixed label keyed by the password, so it is useless without the password
 * and changes whenever the password is rotated.
 */
export const ACCESS_COOKIE = "gm_access";

export async function accessToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("generalmind-gtm-radar/access/v1"));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
