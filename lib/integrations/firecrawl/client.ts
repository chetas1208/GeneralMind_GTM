import "server-only";
import type { z } from "zod";
import { requireEnv } from "@/lib/env";
import { requestJson } from "@/lib/http";
import { limiter } from "@/lib/concurrency";

const BASE_URL = "https://api.firecrawl.dev/v2";
const firecrawlLimit = limiter("firecrawl", 2);

export function firecrawlRequest<T>(path: string, body: unknown, schema: z.ZodType<T>, timeoutMs = 60_000) {
  return firecrawlLimit(() =>
    requestJson({
      service: "firecrawl",
      url: `${BASE_URL}${path}`,
      method: "POST",
      headers: { Authorization: `Bearer ${requireEnv("FIRECRAWL_API_KEY")}` },
      body,
      schema,
      timeoutMs,
      retries: 1,
    }),
  );
}
