import { NextResponse } from "next/server";
import { z } from "zod";
import { ACCESS_COOKIE, SESSION_TTL_SECONDS, passwordMatches, readAuthConfig } from "@/lib/access";
import { HttpError } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import { assertSameOrigin } from "@/lib/origin";
import { loginAttemptKey, recordLoginFailure, tooManyLoginFailures } from "@/lib/security/rate-limit";
import { openReviewerSession } from "@/lib/security/sessions";

const body = z.object({ password: z.string().min(1).max(200) });
const log = createLogger("auth");

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 403;
    return NextResponse.json({ error: "Request blocked" }, { status });
  }

  const auth = readAuthConfig();
  if (!auth.configured) {
    return NextResponse.json({ error: "Access control is not configured on this deployment." }, { status: 503 });
  }

  const key = await loginAttemptKey(request, auth.secret);
  if (await tooManyLoginFailures(key)) {
    log.warn("login rate limit", { keyPrefix: key.slice(0, 8) });
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }

  const raw = await request.text();
  if (raw.length > 1_000) {
    await recordLoginFailure(key);
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }
  let parsedBody: unknown = null;
  if (raw) {
    try {
      parsedBody = JSON.parse(raw);
    } catch {
      parsedBody = null;
    }
  }
  const parsed = body.safeParse(parsedBody);
  if (!parsed.success || !(await passwordMatches(parsed.data.password, auth.password))) {
    await recordLoginFailure(key);
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, await openReviewerSession(auth.secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  log.info("login");
  return res;
}
