import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ConfigError } from "@/lib/env";
import { IntegrationError } from "@/lib/http";
import { createLogger } from "@/lib/logger";

const log = createLogger("api");

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Uniform JSON error responses; never leaks stack traces or secrets. */
export function toErrorResponse(e: unknown): NextResponse {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid input", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }
  if (e instanceof ConfigError) return NextResponse.json({ error: e.message, variable: e.variable }, { status: 503 });
  if (e instanceof IntegrationError) {
    log.warn("integration error", { service: e.service, kind: e.kind, status: e.status });
    return NextResponse.json({ error: e.message, service: e.service, kind: e.kind }, { status: e.kind === "rate_limit" ? 429 : 502 });
  }
  log.error("unhandled", { error: e instanceof Error ? e.message : String(e) });
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function handle(fn: () => Promise<NextResponse | Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    return toErrorResponse(e);
  }
}

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { "Cache-Control": "no-store", ...init?.headers } });
}

const MAX_BODY_CHARS = 32_000;

export async function readJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_CHARS) throw new HttpError(413, "Request body is too large");
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) throw new HttpError(413, "Request body is too large");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
