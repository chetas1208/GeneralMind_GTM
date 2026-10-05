import { NextResponse } from "next/server";
import { z } from "zod";
import { ACCESS_COOKIE, accessToken, safeEqual } from "@/lib/access";

const body = z.object({ password: z.string().min(1).max(200) });

export async function POST(request: Request) {
  const expected = process.env.APP_ACCESS_PASSWORD;
  if (!expected) return NextResponse.json({ ok: true, gated: false });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !safeEqual(await accessToken(parsed.data.password), await accessToken(expected))) {
    await new Promise((r) => setTimeout(r, 600)); // blunt brute-force speed bump
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, await accessToken(expected), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return res;
}
