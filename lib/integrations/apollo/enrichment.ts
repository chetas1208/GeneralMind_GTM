import "server-only";
import { createLogger } from "@/lib/logger";
import { apolloRequest } from "./client";
import { apolloPeopleMatchResponseSchema, type ApolloPerson } from "./schemas";

const log = createLogger("apollo");

/**
 * Enrich one person (spends credits). Never requests phone numbers or personal
 * emails. Returns null when Apollo cannot match – callers must leave fields empty.
 */
export async function enrichPerson(input: {
  id?: string;
  firstName?: string;
  lastName?: string;
  domain?: string;
  organizationName?: string;
  linkedinUrl?: string;
}): Promise<ApolloPerson | null> {
  const res = await apolloRequest({
    path: "/people/match",
    method: "POST",
    body: {
      ...(input.id ? { id: input.id } : {}),
      ...(input.firstName ? { first_name: input.firstName } : {}),
      ...(input.lastName ? { last_name: input.lastName } : {}),
      ...(input.domain ? { domain: input.domain } : {}),
      ...(input.organizationName ? { organization_name: input.organizationName } : {}),
      ...(input.linkedinUrl ? { linkedin_url: input.linkedinUrl } : {}),
      reveal_personal_emails: false,
      reveal_phone_number: false,
    },
    schema: apolloPeopleMatchResponseSchema,
  });
  log.info("person match", { matched: Boolean(res.person) });
  return res.person ?? null;
}
