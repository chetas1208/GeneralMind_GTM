import { NextResponse } from "next/server";
import { HttpError } from "@/lib/api";
import { requireReviewer } from "@/lib/auth";
import { getIntegrationHealth } from "@/lib/integrations/health";

export const maxDuration = 60;

/** Returns configured/healthy state per integration. Never includes secrets. */
export async function GET(request: Request) {
  try {
    await requireReviewer(request);
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  const services = await getIntegrationHealth({ fresh });
  const ok = services.every((s) => s.status === "ok" || s.status === "degraded" || s.status === "unconfigured");
  return NextResponse.json({ ok, services }, { headers: { "Cache-Control": "no-store" } });
}
