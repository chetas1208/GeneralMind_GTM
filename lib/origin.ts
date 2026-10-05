import { HttpError } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("origin");

/**
 * Cookie-authenticated mutations must come from this site.
 * Browsers send Origin on POST. A missing Origin is allowed (non-browser callers, and SameSite=lax
 * already withholds the cookie on cross-site form posts). A present Origin must match this host.
 */
export function assertSameOrigin(request: Request): void {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    log.warn("blocked cross-site mutation", { method, path: new URL(request.url).pathname });
    throw new HttpError(403, "Request blocked");
  }

  const origin = request.headers.get("origin");
  if (!origin) return;

  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    log.warn("blocked mutation with malformed origin", { method });
    throw new HttpError(403, "Request blocked");
  }

  const allowed = new Set<string>();
  for (const header of [request.headers.get("host"), request.headers.get("x-forwarded-host")]) {
    const host = header?.split(",")[0]?.trim().toLowerCase();
    if (host) allowed.add(host);
  }
  try {
    allowed.add(new URL(request.url).host.toLowerCase());
  } catch {
    /* request url is always absolute in the Next runtime */
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      allowed.add(new URL(appUrl).host.toLowerCase());
    } catch {
      /* ignore a malformed public URL */
    }
  }

  if (!allowed.has(originHost)) {
    log.warn("blocked mutation from foreign origin", { method, originHost });
    throw new HttpError(403, "Request blocked");
  }
}
