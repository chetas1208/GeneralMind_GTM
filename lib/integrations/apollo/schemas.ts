import { z } from "zod";

const nullableString = z.string().nullable().optional();

export const apolloOrganizationSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    website_url: nullableString,
    linkedin_url: nullableString,
    primary_domain: nullableString,
    industry: nullableString,
    industries: z.array(z.string()).nullable().optional(),
    secondary_industries: z.array(z.string()).nullable().optional(),
    keywords: z.array(z.string()).nullable().optional(),
    estimated_num_employees: z.number().nullable().optional(),
    annual_revenue: z.number().nullable().optional(),
    organization_revenue: z.number().nullable().optional(),
    short_description: nullableString,
    city: nullableString,
    state: nullableString,
    country: nullableString,
    technology_names: z.array(z.string()).nullable().optional(),
    current_technologies: z
      .array(z.object({ name: z.string(), category: nullableString }).passthrough())
      .nullable()
      .optional(),
  })
  .passthrough();

export const apolloOrgEnrichResponseSchema = z.object({
  organization: apolloOrganizationSchema.nullable().optional(),
});

export const apolloPersonSchema = z
  .object({
    id: z.string(),
    first_name: nullableString,
    last_name: nullableString,
    last_name_obfuscated: nullableString,
    name: nullableString,
    title: nullableString,
    seniority: nullableString,
    departments: z.array(z.string()).nullable().optional(),
    email: nullableString,
    email_status: nullableString,
    linkedin_url: nullableString,
    city: nullableString,
    state: nullableString,
    country: nullableString,
    has_email: z.boolean().nullable().optional(),
    organization: z
      .object({
        id: nullableString,
        name: nullableString,
        primary_domain: nullableString,
        website_url: nullableString,
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export const apolloPeopleSearchResponseSchema = z.object({
  people: z.array(apolloPersonSchema).default([]),
  total_entries: z.number().nullable().optional(),
  pagination: z.object({ total_entries: z.number().nullable().optional() }).passthrough().optional(),
});

export const apolloPeopleMatchResponseSchema = z.object({
  person: apolloPersonSchema.nullable().optional(),
});

export const apolloHealthSchema = z.object({
  healthy: z.boolean().optional(),
  is_logged_in: z.boolean().optional(),
});

export type ApolloOrganization = z.infer<typeof apolloOrganizationSchema>;
export type ApolloPerson = z.infer<typeof apolloPersonSchema>;
