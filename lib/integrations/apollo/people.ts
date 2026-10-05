import "server-only";
import { createLogger } from "@/lib/logger";
import { apolloRequest } from "./client";
import { apolloPeopleSearchResponseSchema, type ApolloPerson } from "./schemas";

const log = createLogger("apollo");

/** Titles/seniorities that map to GeneralMind's buying committee. */
export const TARGET_TITLES = [
  "Chief Operating Officer",
  "Chief Supply Chain Officer",
  "VP Operations",
  "VP Supply Chain",
  "VP Procurement",
  "Head of Procurement",
  "Head of Purchasing",
  "Head of Order Management",
  "Director Operations",
  "Director Supply Chain",
  "Director Procurement",
  "Director Finance Operations",
  "Accounts Payable Manager",
  "Chief Information Officer",
  "Director Enterprise Applications",
  "ERP Director",
  "SAP Director",
  "Digital Transformation",
];

/**
 * People search at a single company (no credits; returns obfuscated surnames and
 * no emails). Requires a paid Apollo plan – throws `ApolloPlanError` otherwise.
 */
export async function searchPeopleAtCompany(opts: {
  domain: string;
  titles?: string[];
  limit?: number;
}): Promise<ApolloPerson[]> {
  const res = await apolloRequest({
    path: "/mixed_people/api_search",
    method: "POST",
    body: {
      q_organization_domains_list: [opts.domain],
      person_titles: opts.titles ?? TARGET_TITLES,
      person_seniorities: ["c_suite", "vp", "head", "director", "manager"],
      per_page: Math.min(opts.limit ?? 5, 25),
      page: 1,
    },
    schema: apolloPeopleSearchResponseSchema,
  });
  log.info("people search", { domain: opts.domain, found: res.people.length });
  return res.people;
}
