import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { isConfigured, getEnv } from "@/lib/env";
import { IntegrationError } from "@/lib/http";
import { aiHealthCheck } from "@/lib/ai/client";
import { exaHealthCheck } from "@/lib/integrations/exa/search";
import { firecrawlHealthCheck } from "@/lib/integrations/firecrawl/scrape";
import { apolloHealthCheck } from "@/lib/integrations/apollo/organizations";
import { ApolloPlanError } from "@/lib/integrations/apollo/client";
import { searchPeopleAtCompany } from "@/lib/integrations/apollo/people";
import { hubspotHealthCheck } from "@/lib/integrations/hubspot/client";

export type ServiceId = "database" | "exa" | "firecrawl" | "apollo" | "nvidia" | "hubspot" | "inngest";
/** Internal probe result. The system page maps these to human labels (Healthy, Not configured, …). */
export type ServiceStatus = "ok" | "degraded" | "error" | "unconfigured" | "invalid_credentials" | "rate_limited";

export const SERVICE_STATUS_LABEL: Record<ServiceStatus, string> = {
  ok: "Healthy",
  degraded: "Degraded",
  error: "Error",
  unconfigured: "Not configured",
  invalid_credentials: "Invalid credentials",
  rate_limited: "Rate limited",
};

export type ServiceHealth = {
  id: ServiceId;
  label: string;
  purpose: string;
  status: ServiceStatus;
  configured: boolean;
  detail: string;
  latencyMs?: number;
  checkedAt: string;
};

type Check = {
  id: ServiceId;
  label: string;
  purpose: string;
  envKey: Parameters<typeof isConfigured>[0];
  /** Overrides the env-key check (e.g. Inngest needs no keys against the local dev server). */
  configured?: () => boolean;
  run: () => Promise<{ status?: ServiceStatus; detail: string }>;
};

const devMode = () => process.env.NODE_ENV !== "production" && isConfigured("INNGEST_DEV");

const checks: Check[] = [
  {
    id: "database",
    label: "Neon PostgreSQL",
    purpose: "System of record (Drizzle ORM)",
    envKey: "DATABASE_URL",
    run: async () => {
      const rows = await getDb().execute<{ n: string }>(sql`select count(*)::text as n from information_schema.tables where table_schema = 'public'`);
      return { detail: `Connected · ${rows.rows[0]?.n ?? "?"} tables in public schema` };
    },
  },
  {
    id: "exa",
    label: "Exa",
    purpose: "Event, speaker, sponsor and exhibitor discovery",
    envKey: "EXA_API_KEY",
    run: async () => {
      const r = await exaHealthCheck();
      return { detail: `Search OK (${r.results} result)` };
    },
  },
  {
    id: "firecrawl",
    label: "Firecrawl",
    purpose: "Rendered scraping and structured extraction",
    envKey: "FIRECRAWL_API_KEY",
    run: async () => {
      const r = await firecrawlHealthCheck();
      return { detail: `Scrape OK (${r.chars} chars)` };
    },
  },
  {
    id: "apollo",
    label: "Apollo",
    purpose: "Company enrichment, people search and enrichment",
    envKey: "APOLLO_API_KEY",
    run: async () => {
      const h = await apolloHealthCheck();
      if (!h.healthy) return { status: "error", detail: "Apollo reports unhealthy" };
      try {
        await searchPeopleAtCompany({ domain: "example.com", limit: 1 });
        return { detail: "Authenticated · people search available" };
      } catch (e) {
        if (e instanceof ApolloPlanError) {
          return {
            status: "degraded",
            detail:
              "Company enrichment live. People Search / Match are not in this Apollo plan, so contacts come from event evidence plus verified public profiles; work emails are left empty, never guessed.",
          };
        }
        throw e;
      }
    },
  },
  {
    id: "nvidia",
    label: "NVIDIA Nemotron",
    purpose: "Structured extraction and qualification explanations",
    envKey: "NVIDIA_API_KEY",
    run: async () => {
      const r = await aiHealthCheck();
      return { detail: `${r.model} · completion OK` };
    },
  },
  {
    id: "inngest",
    label: "Inngest",
    purpose: "Durable background workflows (discovery and lead sourcing)",
    envKey: "INNGEST_EVENT_KEY",
    configured: () => devMode() || (isConfigured("INNGEST_EVENT_KEY") && isConfigured("INNGEST_SIGNING_KEY")),
    run: async () => {
      if (devMode()) {
        const base = /^https?:\/\//.test(getEnv().INNGEST_DEV ?? "") ? getEnv().INNGEST_DEV! : "http://localhost:8288";
        const res = await fetch(base, { signal: AbortSignal.timeout(4_000) });
        return { detail: `Dev server reachable at ${base} (HTTP ${res.status}). Production uses Inngest Cloud with signed requests.` };
      }
      return { detail: "Event key and signing key configured. Functions are served at /api/inngest and verified by signature." };
    },
  },
  {
    id: "hubspot",
    label: "HubSpot",
    purpose: "CRM sync for human-approved leads",
    envKey: "HUBSPOT_ACCESS_TOKEN",
    run: async () => {
      await hubspotHealthCheck();
      return { detail: "Authenticated · CRM read OK" };
    },
  },
];

function describeError(e: unknown): string {
  if (e instanceof IntegrationError) return e.message.slice(0, 280);
  if (e instanceof Error) return e.message.slice(0, 280);
  return "Unknown error";
}

async function runCheck(c: Check): Promise<ServiceHealth> {
  const checkedAt = new Date().toISOString();
  const base = { id: c.id, label: c.label, purpose: c.purpose, checkedAt };
  if (!(c.configured ? c.configured() : isConfigured(c.envKey))) {
    return {
      ...base,
      status: "unconfigured",
      configured: false,
      detail: c.id === "inngest" ? "INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY are not both set (or INNGEST_DEV for local development). Background jobs cannot start." : `${c.envKey} is not set. Add it to .env to enable this integration.`,
    };
  }
  const started = Date.now();
  try {
    const r = await Promise.race([
      c.run(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Health check timed out after 25s")), 25_000)),
    ]);
    return { ...base, configured: true, status: r.status ?? "ok", detail: r.detail, latencyMs: Date.now() - started };
  } catch (e) {
    let status: ServiceStatus = "error";
    if (e instanceof IntegrationError) {
      if (e.kind === "auth") status = "invalid_credentials";
      else if (e.kind === "rate_limit") status = "rate_limited";
    }
    return { ...base, configured: true, status, detail: describeError(e), latencyMs: Date.now() - started };
  }
}

let cache: { at: number; value: ServiceHealth[] } | undefined;

/** Runs every probe in parallel. Results are cached briefly to avoid spending API quota on refreshes. */
export async function getIntegrationHealth(opts: { fresh?: boolean } = {}): Promise<ServiceHealth[]> {
  getEnv(); // fail fast on malformed env
  if (!opts.fresh && cache && Date.now() - cache.at < 60_000) return cache.value;
  const value = await Promise.all(checks.map(runCheck));
  cache = { at: Date.now(), value };
  return value;
}
