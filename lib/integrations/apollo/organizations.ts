import "server-only";
import { createLogger } from "@/lib/logger";
import { apolloRequest } from "./client";
import {
  apolloHealthSchema,
  apolloOrgEnrichResponseSchema,
  type ApolloOrganization,
} from "./schemas";

const log = createLogger("apollo");

/** Enrich a company by domain (available on every Apollo plan). */
export async function enrichOrganizationByDomain(domain: string): Promise<ApolloOrganization | null> {
  const res = await apolloRequest({
    path: "/organizations/enrich",
    query: { domain },
    schema: apolloOrgEnrichResponseSchema,
  });
  log.info("org enrich", { domain, found: Boolean(res.organization) });
  return res.organization ?? null;
}

export async function apolloHealthCheck() {
  const res = await apolloRequest({ path: "/auth/health", schema: apolloHealthSchema });
  return { healthy: res.healthy === true, loggedIn: res.is_logged_in === true };
}
