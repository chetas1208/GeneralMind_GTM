import "server-only";
import { requireEnv } from "@/lib/env";
import { requestJson } from "@/lib/http";
import { limiter } from "@/lib/concurrency";
import type { z } from "zod";

const BASE_URL = "https://api.exa.ai";
/** Exa tolerates modest parallelism; keep it conservative. */
const exaLimit = limiter("exa", 3);

export function exaRequest<T>(path: string, body: unknown, schema: z.ZodType<T>, timeoutMs = 30_000) {
  return exaLimit(() =>
    requestJson({
      service: "exa",
      url: `${BASE_URL}${path}`,
      method: "POST",
      headers: { "x-api-key": requireEnv("EXA_API_KEY") },
      body,
      schema,
      timeoutMs,
      retries: 2,
    }),
  );
}
