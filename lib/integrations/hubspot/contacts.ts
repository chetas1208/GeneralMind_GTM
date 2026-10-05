import "server-only";
import { createLogger } from "@/lib/logger";
import { IntegrationError } from "@/lib/http";
import { hubspotObjectSchema, hubspotRequest, hubspotSearchSchema, type HubspotObject } from "./client";

const log = createLogger("hubspot");

export type HubspotContactInput = {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  jobTitle?: string | null;
  companyName?: string | null;
  linkedinUrl?: string | null;
  /** Optional GeneralMind metadata; dropped automatically if the portal lacks the properties. */
  extra?: Record<string, string>;
};

export async function findContactByEmail(email: string): Promise<HubspotObject | null> {
  const res = await hubspotRequest({
    path: "/crm/v3/objects/contacts/search",
    method: "POST",
    body: {
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email.toLowerCase() }] }],
      properties: ["email", "firstname", "lastname"],
      limit: 1,
    },
    schema: hubspotSearchSchema,
  });
  return res.results[0] ?? null;
}

/** Fallback match when no email is available: exact name + company. */
export async function findContactByNameAndCompany(
  firstName: string,
  lastName: string,
  companyName: string,
): Promise<HubspotObject | null> {
  const res = await hubspotRequest({
    path: "/crm/v3/objects/contacts/search",
    method: "POST",
    body: {
      filterGroups: [
        {
          filters: [
            { propertyName: "firstname", operator: "EQ", value: firstName },
            { propertyName: "lastname", operator: "EQ", value: lastName },
            { propertyName: "company", operator: "EQ", value: companyName },
          ],
        },
      ],
      properties: ["email", "firstname", "lastname"],
      limit: 1,
    },
    schema: hubspotSearchSchema,
  });
  return res.results[0] ?? null;
}

function baseProperties(input: HubspotContactInput): Record<string, string> {
  const p: Record<string, string> = {};
  if (input.email) p.email = input.email.toLowerCase();
  if (input.firstName) p.firstname = input.firstName;
  if (input.lastName) p.lastname = input.lastName;
  if (input.jobTitle) p.jobtitle = input.jobTitle;
  if (input.companyName) p.company = input.companyName;
  return p;
}

/** Only a real https LinkedIn profile URL is ever sent to the CRM. */
function linkedinProperty(url: string | null | undefined): Record<string, string> {
  try {
    const u = new URL(url ?? "");
    return u.protocol === "https:" && /(^|\.)linkedin\.com$/i.test(u.hostname) && u.pathname.startsWith("/in/") ? { hs_linkedin_url: u.toString() } : {};
  } catch {
    return {};
  }
}

const isPropertyError = (e: unknown) =>
  e instanceof IntegrationError &&
  e.status === 400 &&
  /PROPERTY_DOESNT_EXIST|Property values were not valid|does not exist/i.test(JSON.stringify(e.body ?? e.message));

/**
 * Create or update a contact. Idempotent: prior HubSpot id → email → name+company.
 * Custom properties are attempted first and silently dropped if the portal rejects them.
 */
export async function upsertContact(
  input: HubspotContactInput,
  existingId?: string | null,
): Promise<{ id: string; created: boolean; usedExtraProperties: boolean }> {
  let id = existingId ?? undefined;
  if (!id && input.email) id = (await findContactByEmail(input.email))?.id;
  if (!id && !input.email && input.firstName && input.lastName && input.companyName) {
    id = (await findContactByNameAndCompany(input.firstName, input.lastName, input.companyName))?.id;
  }

  const base = baseProperties(input);
  const linkedin = linkedinProperty(input.linkedinUrl);
  const extra = input.extra ?? {};

  const write = async (properties: Record<string, string>) =>
    id
      ? hubspotRequest({
          path: `/crm/v3/objects/contacts/${id}`,
          method: "PATCH",
          body: { properties },
          schema: hubspotObjectSchema,
        })
      : hubspotRequest({
          path: "/crm/v3/objects/contacts",
          method: "POST",
          body: { properties },
          schema: hubspotObjectSchema,
        });

  // Richest first; each step drops the optional properties a portal might not have.
  const attempts: Array<{ props: Record<string, string>; usedExtra: boolean }> = [
    { props: { ...base, ...linkedin, ...extra }, usedExtra: Object.keys(extra).length > 0 },
    { props: { ...base, ...linkedin }, usedExtra: false },
    { props: base, usedExtra: false },
  ].filter((a, i, arr) => i === 0 || Object.keys(a.props).length < Object.keys(arr[i - 1].props).length);

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const res = await write(attempt.props);
      log.info(id ? "contact updated" : "contact created", { id: res.id });
      return { id: res.id, created: !id, usedExtraProperties: attempt.usedExtra };
    } catch (e) {
      if (!isPropertyError(e)) throw e;
      log.warn("optional contact properties rejected; retrying with fewer properties");
      lastError = e;
    }
  }
  throw lastError;
}
