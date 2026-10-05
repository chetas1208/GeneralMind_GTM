import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, accessToken, safeEqual } from "@/lib/access";

/**
 * Access gate. When APP_ACCESS_PASSWORD is set, every page and API route requires the access cookie,
 * so nobody can trigger paid provider calls or push to the CRM anonymously. The Inngest endpoint is
 * exempt because the Inngest SDK verifies request signatures itself (INNGEST_SIGNING_KEY).
 */
export async function proxy(request: NextRequest) {
  const password = process.env.APP_ACCESS_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname === "/login" || pathname === "/api/auth/login" || pathname.startsWith("/api/inngest")) return NextResponse.next();

  const cookie = request.cookies.get(ACCESS_COOKIE)?.value ?? "";
  if (cookie && safeEqual(cookie, await accessToken(password))) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL("/login", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
