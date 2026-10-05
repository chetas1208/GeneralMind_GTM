import { NextResponse } from "next/server";
import { z } from "zod";
import { ACCESS_COOKIE, SESSION_TTL_SECONDS, createSessionToken, passwordMatches, readAuthConfig } from "@/lib/access";

const body = z.object({ password: z.string().min(1).max(200) });

export async function POST(request: Request) {
  const auth = readAuthConfig();
  if (!auth.configured) {
    return NextResponse.json({ error: "Access control is not configured on this deployment." }, { status: 503 });
  }

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !(await passwordMatches(parsed.data.password, auth.password))) {
    await new Promise((r) => setTimeout(r, 600)); // blunt brute-force speed bump
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, await createSessionToken(auth.secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
