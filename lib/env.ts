import "server-only";
import { z } from "zod";

/**
 * Server-side environment contract.
 *
 * Every secret is optional at parse-time so `next build` never depends on
 * credentials. Services call `requireEnv()` at the point of use, which throws a
 * `ConfigError` naming the missing variable (fail fast, never fabricate).
 * Malformed values (e.g. a non-URL base URL) fail immediately.
 */
const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());

const envSchema = z.object({
  DATABASE_URL: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .refine((v) => /^postgres(ql)?:\/\//.test(v), "must be a postgres:// URL")
      .optional(),
  ),
  EXA_API_KEY: optionalString,
  FIRECRAWL_API_KEY: optionalString,
  APOLLO_API_KEY: optionalString,
  NVIDIA_API_KEY: optionalString,
  MODEL_BASE_URL: z.preprocess(
    emptyToUndefined,
    z.url().default("https://integrate.api.nvidia.com/v1"),
  ),
  MODEL_NAME: z.preprocess(
    emptyToUndefined,
    z.string().min(1).default("nvidia/nemotron-3-ultra-550b-a55b"),
  ),
  HUBSPOT_ACCESS_TOKEN: optionalString,
  NEXT_PUBLIC_APP_URL: z.preprocess(
    emptyToUndefined,
    z.url().default("http://localhost:3000"),
  ),
  /** Inngest (durable background jobs). Both are required in production; local dev uses the Inngest dev server. */
  INNGEST_EVENT_KEY: optionalString,
  INNGEST_SIGNING_KEY: optionalString,
  /** Set to "1" locally to talk to the Inngest dev server instead of Inngest Cloud. */
  INNGEST_DEV: optionalString,
  /** When set, every page and API route (except the signed Inngest endpoint) requires this shared access password. */
  APP_ACCESS_PASSWORD: optionalString,
});

export type Env = z.infer<typeof envSchema>;

export class ConfigError extends Error {
  constructor(
    message: string,
    readonly variable?: string,
  ) {
    super(message);
    this.name = "ConfigError";
  }
}

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new ConfigError(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

type SecretKey =
  | "DATABASE_URL"
  | "EXA_API_KEY"
  | "FIRECRAWL_API_KEY"
  | "APOLLO_API_KEY"
  | "NVIDIA_API_KEY"
  | "HUBSPOT_ACCESS_TOKEN"
  | "INNGEST_EVENT_KEY"
  | "INNGEST_SIGNING_KEY"
  | "INNGEST_DEV"
  | "APP_ACCESS_PASSWORD";

export function requireEnv<K extends SecretKey>(key: K): string {
  const value = getEnv()[key];
  if (!value) {
    throw new ConfigError(`${key} is not configured. Add it to .env (see .env.example).`, key);
  }
  return value;
}

export function isConfigured(key: SecretKey): boolean {
  return Boolean(getEnv()[key]);
}
