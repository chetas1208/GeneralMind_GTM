import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { companies, eventCompanies } from "@/lib/db/schema";
import { normalizeCompanyName, normalizeDomain, normalizeLinkedin } from "@/lib/text";

export type CompanyRow = typeof companies.$inferSelect;
export type CompanyInput = {
  name: string;
  domain?: string | null;
  websiteUrl?: string | null;
  linkedinUrl?: string | null;
  apolloId?: string | null;
  industry?: string | null;
  employeeCount?: number | null;
  estimatedRevenue?: number | null;
  headquarters?: string | null;
  country?: string | null;
  description?: string | null;
  erpSignals?: string[];
  operationalSignals?: string[];
};

/**
 * Deterministic company resolution: normalised domain → Apollo ID → normalised name.
 * Existing values are never overwritten with empty ones.
 */
export async function findCompany(input: Pick<CompanyInput, "name" | "domain" | "apolloId">): Promise<CompanyRow | null> {
  const db = getDb();
  const domain = normalizeDomain(input.domain);
  if (domain) {
    const [r] = await db.select().from(companies).where(eq(companies.domain, domain)).limit(1);
    if (r) return r;
  }
  if (input.apolloId) {
    const [r] = await db.select().from(companies).where(eq(companies.apolloId, input.apolloId)).limit(1);
    if (r) return r;
  }
  const norm = normalizeCompanyName(input.name);
  if (norm) {
    const [r] = await db.select().from(companies).where(eq(companies.normalizedName, norm)).limit(1);
    if (r) return r;
  }
  return null;
}

export async function upsertCompany(input: CompanyInput): Promise<CompanyRow> {
  const db = getDb();
  const domain = normalizeDomain(input.domain ?? input.websiteUrl);
  const existing = await findCompany({ ...input, domain });

  const values = {
    domain,
    websiteUrl: input.websiteUrl ?? undefined,
    linkedinUrl: normalizeLinkedin(input.linkedinUrl) ?? undefined,
    apolloId: input.apolloId ?? undefined,
    industry: input.industry ?? undefined,
    employeeCount: input.employeeCount ?? undefined,
    estimatedRevenue: input.estimatedRevenue ?? undefined,
    headquarters: input.headquarters ?? undefined,
    country: input.country ?? undefined,
    description: input.description ?? undefined,
    erpSignals: input.erpSignals?.length ? input.erpSignals : undefined,
    operationalSignals: input.operationalSignals?.length ? input.operationalSignals : undefined,
  };

  if (existing) {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(values)) {
      const current = (existing as Record<string, unknown>)[k];
      const empty = current === null || current === undefined || (Array.isArray(current) && current.length === 0);
      if (v !== undefined && v !== null && empty) patch[k] = v;
    }
    // A resolved domain/apolloId must not collide with another row's unique value.
    if (patch.domain) {
      const [clash] = await db.select({ id: companies.id }).from(companies).where(eq(companies.domain, patch.domain as string)).limit(1);
      if (clash && clash.id !== existing.id) delete patch.domain;
    }
    if (patch.apolloId) {
      const [clash] = await db.select({ id: companies.id }).from(companies).where(eq(companies.apolloId, patch.apolloId as string)).limit(1);
      if (clash && clash.id !== existing.id) delete patch.apolloId;
    }
    const [row] = await db.update(companies).set(patch).where(eq(companies.id, existing.id)).returning();
    return row;
  }

  const [row] = await db
    .insert(companies)
    .values({
      name: input.name.trim(),
      normalizedName: normalizeCompanyName(input.name),
      ...Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)),
    })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  // Lost a race on a unique key; resolve again.
  const again = await findCompany({ ...input, domain });
  if (!again) throw new Error(`Failed to upsert company ${input.name}`);
  return again;
}

export async function getCompany(id: string): Promise<CompanyRow | null> {
  const [r] = await getDb().select().from(companies).where(eq(companies.id, id)).limit(1);
  return r ?? null;
}

export async function updateCompany(id: string, patch: Partial<typeof companies.$inferInsert>): Promise<CompanyRow> {
  const [r] = await getDb()
    .update(companies)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(companies.id, id))
    .returning();
  return r;
}

export async function linkEventCompany(input: {
  eventId: string;
  companyId: string;
  associationType: typeof eventCompanies.$inferInsert.associationType;
  confidence: number;
  sourceUrl: string;
  sourceTitle?: string | null;
  evidenceText?: string | null;
}): Promise<void> {
  await getDb()
    .insert(eventCompanies)
    .values({
      eventId: input.eventId,
      companyId: input.companyId,
      associationType: input.associationType,
      confidence: input.confidence,
      sourceUrl: input.sourceUrl,
      sourceTitle: input.sourceTitle ?? null,
      evidenceText: input.evidenceText ?? null,
    })
    .onConflictDoNothing();
}

export type EventCompanyListItem = {
  companyId: string;
  name: string;
  domain: string | null;
  industry: string | null;
  employeeCount: number | null;
  companyFitScore: number | null;
  associations: { type: string; confidence: number; sourceUrl: string; evidenceText: string | null }[];
};

export async function listEventCompanies(eventId: string): Promise<EventCompanyListItem[]> {
  const rows = await getDb()
    .select({
      companyId: companies.id,
      name: companies.name,
      domain: companies.domain,
      industry: companies.industry,
      employeeCount: companies.employeeCount,
      companyFitScore: companies.companyFitScore,
      type: eventCompanies.associationType,
      confidence: eventCompanies.confidence,
      sourceUrl: eventCompanies.sourceUrl,
      evidenceText: eventCompanies.evidenceText,
    })
    .from(eventCompanies)
    .innerJoin(companies, eq(companies.id, eventCompanies.companyId))
    .where(eq(eventCompanies.eventId, eventId));

  const map = new Map<string, EventCompanyListItem>();
  for (const r of rows) {
    const item = map.get(r.companyId) ?? {
      companyId: r.companyId,
      name: r.name,
      domain: r.domain,
      industry: r.industry,
      employeeCount: r.employeeCount,
      companyFitScore: r.companyFitScore,
      associations: [],
    };
    item.associations.push({ type: r.type, confidence: r.confidence, sourceUrl: r.sourceUrl, evidenceText: r.evidenceText });
    map.set(r.companyId, item);
  }
  return [...map.values()].sort((a, b) => (b.companyFitScore ?? -1) - (a.companyFitScore ?? -1) || a.name.localeCompare(b.name));
}

export async function listCompanyEventLinks(companyId: string) {
  return getDb()
    .select({ eventId: eventCompanies.eventId, type: eventCompanies.associationType })
    .from(eventCompanies)
    .where(eq(eventCompanies.companyId, companyId));
}

export async function countCompanies(): Promise<number> {
  const [r] = await getDb().select({ n: sql<number>`count(*)::int` }).from(companies);
  return r?.n ?? 0;
}
