import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, isOpenDevMode, readAuthConfig, verifySessionToken } from "@/lib/access";

/**
 * Access gate (first line of defence; mutation handlers re-check via `requireReviewer`).
 * Every page and API route requires a signed reviewer session. Exempt: the login page/endpoint and
 * the Inngest endpoint (the SDK verifies request signatures with INNGEST_SIGNING_KEY itself).
 * Fails closed when auth is not configured outside local development.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (pathname.startsWith("/api/inngest")) return NextResponse.next();
  if (isOpenDevMode()) return NextResponse.next();

  const auth = readAuthConfig();
  if (!auth.configured) {
    const body = { error: "Access control is not configured on this deployment." };
    return isApi ? NextResponse.json(body, { status: 503 }) : new NextResponse(body.error, { status: 503 });
  }

  if (pathname === "/login" || pathname === "/api/auth/login") return NextResponse.next();

  if (await verifySessionToken(request.cookies.get(ACCESS_COOKIE)?.value, auth.secret)) return NextResponse.next();

  if (isApi) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL("/login", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
