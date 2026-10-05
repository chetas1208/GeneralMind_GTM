import "server-only";
import type { z } from "zod";
import { createLogger } from "@/lib/logger";

const log = createLogger("http");

export type IntegrationErrorKind =
  | "auth" // 401 / 403
  | "rate_limit" // 429
  | "server" // 5xx
  | "timeout"
  | "network"
  | "bad_request" // other 4xx
  | "malformed" // JSON / schema validation failure
  | "config";

export class IntegrationError extends Error {
  constructor(
    readonly service: string,
    readonly kind: IntegrationErrorKind,
    message: string,
    readonly status?: number,
    readonly body?: unknown,
  ) {
    super(`[${service}] ${message}`);
    this.name = "IntegrationError";
  }
  get retryable() {
    return this.kind === "rate_limit" || this.kind === "server" || this.kind === "timeout" || this.kind === "network";
  }
}

export type RequestOptions<T> = {
  service: string;
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Zod schema validating the JSON response. */
  schema: z.ZodType<T>;
  timeoutMs?: number;
  /** Max retries for retryable failures (429/5xx/timeout/network). */
  retries?: number;
  /** Treat these statuses as successful with `null`-able handling by the caller. */
  allowStatuses?: number[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildUrl(url: string, query?: RequestOptions<unknown>["query"]) {
  if (!query) return url;
  const u = new URL(url);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) u.searchParams.set(k, String(v));
  }
  return u.toString();
}

function parseRetryAfter(res: Response): number | undefined {
  const raw = res.headers.get("retry-after");
  if (!raw) return undefined;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return Math.min(secs * 1000, 20_000);
  const date = Date.parse(raw);
  return Number.isNaN(date) ? undefined : Math.min(Math.max(date - Date.now(), 0), 20_000);
}

function classify(status: number): IntegrationErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  return "bad_request";
}

/**
 * Typed JSON request with timeout, bounded retry (exponential backoff + jitter,
 * honouring Retry-After), and schema validation. Never logs headers/bodies that
 * may contain secrets.
 */
export async function requestJson<T>(opts: RequestOptions<T>): Promise<T> {
  const { service, method = "GET", timeoutMs = 20_000, retries = 2 } = opts;
  const url = buildUrl(opts.url, opts.query);
  let attempt = 0;

  for (;;) {
    const started = Date.now();
    let error: IntegrationError;
    let retryAfter: number | undefined;

    try {
      const res = await fetch(url, {
        method,
        headers: {
          Accept: "application/json",
          ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...opts.headers,
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });

      const text = await res.text();
      let json: unknown = undefined;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = undefined;
        }
      }

      if (res.ok || opts.allowStatuses?.includes(res.status)) {
        if (json === undefined) {
          error = new IntegrationError(service, "malformed", `Non-JSON response (HTTP ${res.status})`, res.status);
        } else {
          const parsed = opts.schema.safeParse(json);
          if (parsed.success) {
            log.debug("ok", { service, method, status: res.status, ms: Date.now() - started });
            return parsed.data;
          }
          error = new IntegrationError(
            service,
            "malformed",
            `Response failed validation: ${parsed.error.issues
              .slice(0, 3)
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; ")}`,
            res.status,
            json,
          );
        }
      } else {
        const kind = classify(res.status);
        retryAfter = parseRetryAfter(res);
        const detail =
          typeof json === "object" && json !== null
            ? JSON.stringify(json).slice(0, 300)
            : text.slice(0, 300);
        error = new IntegrationError(service, kind, `HTTP ${res.status}: ${detail}`, res.status, json ?? text);
      }
    } catch (e) {
      if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
        error = new IntegrationError(service, "timeout", `Timed out after ${timeoutMs}ms`);
      } else {
        error = new IntegrationError(service, "network", e instanceof Error ? e.message : "Network error");
      }
    }

    if (!error.retryable || attempt >= retries) {
      log.warn("request failed", { service, method, kind: error.kind, status: error.status, attempt });
      throw error;
    }
    const backoff = retryAfter ?? Math.min(500 * 2 ** attempt, 8_000) + Math.random() * 250;
    log.warn("retrying", { service, kind: error.kind, status: error.status, attempt, backoffMs: Math.round(backoff) });
    attempt += 1;
    await sleep(backoff);
  }
}
