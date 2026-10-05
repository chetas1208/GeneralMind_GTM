import "server-only";
import { createLogger } from "@/lib/logger";
import { IntegrationError } from "@/lib/http";
import { hubspotObjectSchema, hubspotRequest, hubspotSearchSchema, type HubspotObject } from "./client";

const log = createLogger("hubspot");

export type HubspotCompanyInput = {
  name: string;
  domain?: string | null;
  employeeCount?: number | null;
  city?: string | null;
  country?: string | null;
  description?: string | null;
  linkedinUrl?: string | null;
};

export async function findCompanyByDomain(domain: string): Promise<HubspotObject | null> {
  const res = await hubspotRequest({
    path: "/crm/v3/objects/companies/search",
    method: "POST",
    body: {
      filterGroups: [{ filters: [{ propertyName: "domain", operator: "EQ", value: domain }] }],
      properties: ["name", "domain"],
      limit: 1,
    },
    schema: hubspotSearchSchema,
  });
  return res.results[0] ?? null;
}

function toProperties(input: HubspotCompanyInput): Record<string, string> {
  const p: Record<string, string> = { name: input.name };
  if (input.domain) p.domain = input.domain;
  if (input.employeeCount) p.numberofemployees = String(input.employeeCount);
  if (input.city) p.city = input.city;
  if (input.country) p.country = input.country;
  if (input.description) p.description = input.description.slice(0, 1_000);
  if (input.linkedinUrl) p.linkedin_company_page = input.linkedinUrl;
  return p;
}

/** Create or update a company. `existingId` (from a prior sync) wins for idempotency. */
export async function upsertCompany(
  input: HubspotCompanyInput,
  existingId?: string | null,
): Promise<{ id: string; created: boolean }> {
  const id = existingId ?? (input.domain ? (await findCompanyByDomain(input.domain))?.id : undefined);
  const properties = toProperties(input);

  if (id) {
    try {
      await hubspotRequest({
        path: `/crm/v3/objects/companies/${id}`,
        method: "PATCH",
        body: { properties },
        schema: hubspotObjectSchema,
      });
      log.info("company updated", { id });
      return { id, created: false };
    } catch (e) {
      // Property rejection must not fail the sync – retry with the minimal set.
      if (e instanceof IntegrationError && e.kind === "bad_request" && e.status === 400) {
        await hubspotRequest({
          path: `/crm/v3/objects/companies/${id}`,
          method: "PATCH",
          body: { properties: { name: input.name, ...(input.domain ? { domain: input.domain } : {}) } },
          schema: hubspotObjectSchema,
        });
        log.warn("company updated with minimal properties", { id });
        return { id, created: false };
      }
      throw e;
    }
  }

  try {
    const created = await hubspotRequest({
      path: "/crm/v3/objects/companies",
      method: "POST",
      body: { properties },
      schema: hubspotObjectSchema,
    });
    log.info("company created", { id: created.id });
    return { id: created.id, created: true };
  } catch (e) {
    if (e instanceof IntegrationError && e.kind === "bad_request" && e.status === 400) {
      const created = await hubspotRequest({
        path: "/crm/v3/objects/companies",
        method: "POST",
        body: { properties: { name: input.name, ...(input.domain ? { domain: input.domain } : {}) } },
        schema: hubspotObjectSchema,
      });
      log.warn("company created with minimal properties", { id: created.id });
      return { id: created.id, created: true };
    }
    throw e;
  }
}
