import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { people } from "@/lib/db/schema";
import { normalizeLinkedin, normalizePersonName, splitName } from "@/lib/text";

export type PersonRow = typeof people.$inferSelect;
export type PersonInput = {
  fullName: string;
  firstName?: string | null;
  lastName?: string | null;
  title?: string | null;
  seniority?: string | null;
  department?: string | null;
  email?: string | null;
  emailStatus?: string | null;
  linkedinUrl?: string | null;
  location?: string | null;
  apolloId?: string | null;
  companyId?: string | null;
  persona?: string | null;
  enrichedAt?: Date | null;
};

export async function listPeopleForCompany(companyId: string, limit = 20): Promise<PersonRow[]> {
  return getDb().select().from(people).where(eq(people.companyId, companyId)).limit(limit);
}

export async function findPerson(input: Pick<PersonInput, "fullName" | "email" | "linkedinUrl" | "apolloId" | "companyId">): Promise<PersonRow | null> {
  const db = getDb();
  if (input.apolloId) {
    const [r] = await db.select().from(people).where(eq(people.apolloId, input.apolloId)).limit(1);
    if (r) return r;
  }
  if (input.email) {
    const [r] = await db.select().from(people).where(eq(people.email, input.email.toLowerCase())).limit(1);
    if (r) return r;
  }
  const li = normalizeLinkedin(input.linkedinUrl);
  if (li) {
    const [r] = await db.select().from(people).where(eq(people.linkedinUrl, li)).limit(1);
    if (r) return r;
  }
  if (input.companyId) {
    const [r] = await db
      .select()
      .from(people)
      .where(and(eq(people.companyId, input.companyId), eq(people.nameKey, normalizePersonName(input.fullName))))
      .limit(1);
    if (r) return r;
  }
  return null;
}

/** Deterministic person resolution: Apollo ID → email → LinkedIn → normalised name + company. */
export async function upsertPerson(input: PersonInput): Promise<PersonRow> {
  const db = getDb();
  const email = input.email ? input.email.toLowerCase() : null;
  const linkedinUrl = normalizeLinkedin(input.linkedinUrl);
  const existing = await findPerson({ ...input, email, linkedinUrl });
  const split = splitName(input.fullName);

  const values = {
    firstName: input.firstName ?? split.firstName,
    lastName: input.lastName ?? split.lastName,
    title: input.title ?? undefined,
    seniority: input.seniority ?? undefined,
    department: input.department ?? undefined,
    email: email ?? undefined,
    emailStatus: input.emailStatus ?? undefined,
    linkedinUrl: linkedinUrl ?? undefined,
    location: input.location ?? undefined,
    apolloId: input.apolloId ?? undefined,
    companyId: input.companyId ?? undefined,
    persona: input.persona ?? undefined,
    enrichedAt: input.enrichedAt ?? undefined,
  };

  if (existing) {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined || v === null) continue;
      const current = (existing as Record<string, unknown>)[k];
      // Enrichment (Apollo) data may refine title/seniority/persona; identity keys only fill gaps.
      const refine = input.enrichedAt && ["title", "seniority", "department", "persona", "location", "enrichedAt"].includes(k);
      if (current === null || current === undefined || refine) patch[k] = v;
    }
    for (const key of ["email", "linkedinUrl", "apolloId"] as const) {
      if (patch[key]) {
        const col = people[key === "linkedinUrl" ? "linkedinUrl" : key];
        const [clash] = await db.select({ id: people.id }).from(people).where(eq(col, patch[key] as string)).limit(1);
        if (clash && clash.id !== existing.id) delete patch[key];
      }
    }
    const [row] = await db.update(people).set(patch).where(eq(people.id, existing.id)).returning();
    return row;
  }

  const [row] = await db
    .insert(people)
    .values({
      fullName: input.fullName.trim(),
      nameKey: normalizePersonName(input.fullName),
      ...Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)),
    })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  const again = await findPerson({ ...input, email, linkedinUrl });
  if (!again) throw new Error(`Failed to upsert person ${input.fullName}`);
  return again;
}

export async function getPerson(id: string): Promise<PersonRow | null> {
  const [r] = await getDb().select().from(people).where(eq(people.id, id)).limit(1);
  return r ?? null;
}
