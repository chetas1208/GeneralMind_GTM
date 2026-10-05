import "server-only";
import type { z } from "zod";
import { requireEnv } from "@/lib/env";
import { IntegrationError, requestJson } from "@/lib/http";
import { limiter } from "@/lib/concurrency";

const BASE_URL = "https://api.apollo.io/api/v1";
/** Apollo is credit- and rate-limited; keep concurrency very low. */
const apolloLimit = limiter("apollo", 2);

/**
 * Raised when the Apollo plan does not include an endpoint (e.g. Free plan).
 * The pipeline treats this as a *capability* gap, not a transient failure.
 */
export class ApolloPlanError extends IntegrationError {
  constructor(readonly endpoint: string) {
    super("apollo", "auth", `Endpoint ${endpoint} is not included in the current Apollo plan`, 403);
    this.name = "ApolloPlanError";
  }
}

export async function apolloRequest<T>(opts: {
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  schema: z.ZodType<T>;
}): Promise<T> {
  return apolloLimit(async () => {
    try {
      return await requestJson({
        service: "apollo",
        url: `${BASE_URL}${opts.path}`,
        method: opts.method ?? "GET",
        headers: { "x-api-key": requireEnv("APOLLO_API_KEY"), "Cache-Control": "no-cache" },
        query: opts.query,
        body: opts.body,
        schema: opts.schema,
        timeoutMs: 25_000,
        retries: 2,
      });
    } catch (e) {
      if (
        e instanceof IntegrationError &&
        e.kind === "auth" &&
        JSON.stringify(e.body ?? "").includes("API_INACCESSIBLE")
      ) {
        throw new ApolloPlanError(opts.path);
      }
      throw e;
    }
  });
}
