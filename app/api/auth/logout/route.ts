import { NextResponse } from "next/server";
import { ACCESS_COOKIE, readAuthConfig, readCookie } from "@/lib/access";
import { HttpError } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import { assertSameOrigin } from "@/lib/origin";
import { revokeSessionToken } from "@/lib/security/sessions";

const log = createLogger("auth");

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 403;
    return NextResponse.json({ error: "Request blocked" }, { status });
  }

  const auth = readAuthConfig();
  if (auth.configured) {
    await revokeSessionToken(readCookie(request.headers.get("cookie"), ACCESS_COOKIE), auth.secret);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  log.info("logout");
  return res;
}

export async function GET(request: Request) {
  const auth = readAuthConfig();
  if (auth.configured) {
    await revokeSessionToken(readCookie(request.headers.get("cookie"), ACCESS_COOKIE), auth.secret);
  }
  const res = NextResponse.redirect(new URL("/login", request.url));
  res.cookies.set(ACCESS_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  log.info("logout get");
  return res;
}

