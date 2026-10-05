import "server-only";
import { z } from "zod";
import { requireEnv } from "@/lib/env";
import { requestJson, type RequestOptions } from "@/lib/http";
import { limiter } from "@/lib/concurrency";

const BASE_URL = "https://api.hubapi.com";
const hubspotLimit = limiter("hubspot", 3);

export function hubspotRequest<T>(
  opts: Pick<RequestOptions<T>, "schema" | "query" | "body" | "allowStatuses"> & {
    path: string;
    method?: RequestOptions<T>["method"];
  },
): Promise<T> {
  return hubspotLimit(() =>
    requestJson({
      service: "hubspot",
      url: `${BASE_URL}${opts.path}`,
      method: opts.method ?? "GET",
      headers: { Authorization: `Bearer ${requireEnv("HUBSPOT_ACCESS_TOKEN")}` },
      query: opts.query,
      body: opts.body,
      schema: opts.schema,
      allowStatuses: opts.allowStatuses,
      timeoutMs: 20_000,
      retries: 2,
    }),
  );
}

export const hubspotObjectSchema = z
  .object({
    id: z.string(),
    properties: z.record(z.string(), z.string().nullable()).default({}),
  })
  .passthrough();

export const hubspotSearchSchema = z.object({
  total: z.number().optional(),
  results: z.array(hubspotObjectSchema).default([]),
});

export type HubspotObject = z.infer<typeof hubspotObjectSchema>;

/** Safe connectivity probe used by /system (read-only). */
export async function hubspotHealthCheck() {
  const res = await hubspotRequest({
    path: "/crm/v3/objects/contacts",
    query: { limit: 1 },
    schema: hubspotSearchSchema,
  });
  return { reachable: true, sampleCount: res.results.length };
}
