import "server-only";
import { createLogger } from "@/lib/logger";
import { associateContactWithCompany } from "./associations";
import { upsertCompany, type HubspotCompanyInput } from "./companies";
import { upsertContact, type HubspotContactInput } from "./contacts";

const log = createLogger("hubspot");

export type HubspotSyncInput = {
  company: HubspotCompanyInput | null;
  contact: HubspotContactInput;
  /** IDs from a previous (possibly partial) sync make retries idempotent. */
  previous?: { contactId?: string | null; companyId?: string | null };
};

export type HubspotSyncResult = {
  contactId: string;
  companyId: string | null;
  contactCreated: boolean;
  companyCreated: boolean;
  associated: boolean;
  usedExtraProperties: boolean;
};

/**
 * company upsert → contact upsert → associate. Safe to re-run: existing IDs are
 * updated rather than duplicated. Throws on hard failures so callers persist the error.
 */
export async function syncLeadToHubspot(input: HubspotSyncInput): Promise<HubspotSyncResult> {
  let companyId: string | null = input.previous?.companyId ?? null;
  let companyCreated = false;

  if (input.company) {
    const c = await upsertCompany(input.company, companyId);
    companyId = c.id;
    companyCreated = c.created;
  }

  const contact = await upsertContact(input.contact, input.previous?.contactId);

  let associated = false;
  if (companyId) {
    await associateContactWithCompany(contact.id, companyId);
    associated = true;
  }

  log.info("lead synced", { contactId: contact.id, companyId, contactCreated: contact.created, associated });
  return {
    contactId: contact.id,
    companyId,
    contactCreated: contact.created,
    companyCreated,
    associated,
    usedExtraProperties: contact.usedExtraProperties,
  };
}
