import "server-only";
import { z } from "zod";
import { hubspotRequest } from "./client";

/** Associate a contact with a company using HubSpot's default association label (idempotent PUT). */
export async function associateContactWithCompany(contactId: string, companyId: string): Promise<void> {
  await hubspotRequest({
    path: `/crm/v4/objects/contacts/${contactId}/associations/default/companies/${companyId}`,
    method: "PUT",
    schema: z.unknown(),
  });
}
