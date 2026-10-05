import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  companies,
  eventLeads,
  events,
  hubspotSyncs,
  leadEvidence,
  people,
  reviewActions,
  type QualificationDetailJson,
  type ScoreBreakdownJson,
} from "@/lib/db/schema";
import { ATTENDANCE_POINTS } from "@/lib/scoring/config";
import { sha1 } from "@/lib/text";

export type LeadRow = typeof eventLeads.$inferSelect;
export type LeadStatus = LeadRow["status"];
export type AttendanceTypeValue = LeadRow["attendanceType"];
export type EvidenceRow = typeof leadEvidence.$inferSelect;
export type EvidenceInsertType = typeof leadEvidence.$inferInsert.sourceType;

/** Create the lead or strengthen its attendance classification (never weaken it). */
export async function upsertEventLead(input: {
  eventId: string;
  personId: string;
  companyId: string | null;
  attendanceType: AttendanceTypeValue;
}): Promise<{ lead: LeadRow; created: boolean }> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(eventLeads)
    .where(and(eq(eventLeads.eventId, input.eventId), eq(eventLeads.personId, input.personId)))
    .limit(1);

  if (existing) {
    const stronger = ATTENDANCE_POINTS[input.attendanceType] > ATTENDANCE_POINTS[existing.attendanceType];
    if (stronger || (!existing.companyId && input.companyId)) {
      const [row] = await db
        .update(eventLeads)
        .set({
          ...(stronger ? { attendanceType: input.attendanceType } : {}),
          ...(!existing.companyId && input.companyId ? { companyId: input.companyId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(eventLeads.id, existing.id))
        .returning();
      return { lead: row, created: false };
    }
    return { lead: existing, created: false };
  }

  const [row] = await db
    .insert(eventLeads)
    .values({
      eventId: input.eventId,
      personId: input.personId,
      companyId: input.companyId,
      attendanceType: input.attendanceType,
    })
    .onConflictDoNothing()
    .returning();
  if (row) return { lead: row, created: true };
  const [again] = await db
    .select()
    .from(eventLeads)
    .where(and(eq(eventLeads.eventId, input.eventId), eq(eventLeads.personId, input.personId)))
    .limit(1);
  return { lead: again, created: false };
}

export async function addEvidence(input: {
  eventLeadId: string;
  sourceType: EvidenceInsertType;
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  evidenceText: string;
  confidence: number;
}): Promise<boolean> {
  const text = input.evidenceText.trim().slice(0, 1_500);
  if (!text) return false;
  const key = await sha1(`${input.sourceType}|${input.sourceUrl ?? ""}|${text.slice(0, 300)}`);
  const rows = await getDb()
    .insert(leadEvidence)
    .values({
      eventLeadId: input.eventLeadId,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl ?? "",
      sourceTitle: input.sourceTitle ?? null,
      evidenceText: text,
      evidenceKey: key,
      confidence: Math.max(0, Math.min(100, Math.round(input.confidence))),
    })
    .onConflictDoNothing()
    .returning({ id: leadEvidence.id });
  return rows.length > 0;
}

export async function listEvidence(eventLeadId: string): Promise<EvidenceRow[]> {
  return getDb().select().from(leadEvidence).where(eq(leadEvidence.eventLeadId, eventLeadId)).orderBy(desc(leadEvidence.confidence), asc(leadEvidence.createdAt));
}

export async function listEvidenceForLeads(leadIds: string[]): Promise<Map<string, EvidenceRow[]>> {
  const out = new Map<string, EvidenceRow[]>();
  if (!leadIds.length) return out;
  const rows = await getDb().select().from(leadEvidence).where(inArray(leadEvidence.eventLeadId, leadIds));
  for (const r of rows) {
    const arr = out.get(r.eventLeadId) ?? [];
    arr.push(r);
    out.set(r.eventLeadId, arr);
  }
  return out;
}

export async function updateLead(
  id: string,
  patch: Partial<{
    status: LeadStatus;
    attendanceType: AttendanceTypeValue;
    attendanceConfidence: number;
    companyFitScore: number;
    personaFitScore: number;
    intentScore: number;
    totalScore: number;
    priorityScore: number;
    signalFrequency: number;
    opportunityHypothesis: import("@/lib/db/schema").OpportunityHypothesisJson | null;
    qualityFlags: import("@/lib/db/schema").LeadQualityFlagsJson | null;
    lastVerifiedAt: Date | null;
    scoreBreakdown: ScoreBreakdownJson;
    qualificationReason: string | null;
    qualificationDetail: QualificationDetailJson | null;
    aiStatus: LeadRow["aiStatus"];
    aiError: string | null;
  }>,
): Promise<LeadRow | null> {
  const [row] = await getDb()
    .update(eventLeads)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(eventLeads.id, id))
    .returning();
  return row ?? null;
}

export async function getLeadRow(id: string): Promise<LeadRow | null> {
  const [row] = await getDb().select().from(eventLeads).where(eq(eventLeads.id, id)).limit(1);
  return row ?? null;
}

export async function listLeadIdsForEvent(eventId: string, statuses?: LeadStatus[]): Promise<string[]> {
  const rows = await getDb()
    .select({ id: eventLeads.id })
    .from(eventLeads)
    .where(and(eq(eventLeads.eventId, eventId), statuses?.length ? inArray(eventLeads.status, statuses) : undefined));
  return rows.map((r) => r.id);
}

/* --------------------------------- Listing -------------------------------- */

export type LeadSort = "score" | "priority" | "attendance" | "company_fit" | "newest";

export type LeadFilters = {
  eventId?: string;
  statuses?: LeadStatus[];
  minScore?: number;
  minAttendance?: number;
  persona?: string;
  industry?: string;
  q?: string;
  sort?: LeadSort;
  limit?: number;
  offset?: number;
};

export type LeadListItem = {
  id: string;
  totalScore: number;
  priorityScore: number;
  companyFitScore: number;
  personaFitScore: number;
  intentScore: number;
  attendanceType: AttendanceTypeValue;
  attendanceConfidence: number;
  status: LeadStatus;
  createdAt: Date;
  person: {
    id: string;
    fullName: string;
    title: string | null;
    persona: string | null;
    email: string | null;
    emailStatus: string | null;
    linkedinUrl: string | null;
  };
  company: { id: string; name: string; industry: string | null; domain: string | null } | null;
  event: { id: string; name: string };
  evidenceCount: number;
  hubspot: { status: string; contactId: string | null } | null;
};

function buildWhere(f: LeadFilters): SQL | undefined {
  const conds: (SQL | undefined)[] = [
    f.eventId ? eq(eventLeads.eventId, f.eventId) : undefined,
    f.statuses?.length ? inArray(eventLeads.status, f.statuses) : undefined,
    f.minScore ? gte(eventLeads.totalScore, f.minScore) : undefined,
    f.minAttendance ? gte(eventLeads.attendanceConfidence, f.minAttendance) : undefined,
    f.persona ? eq(people.persona, f.persona) : undefined,
    f.industry ? ilike(companies.industry, `%${f.industry}%`) : undefined,
    f.q
      ? or(ilike(people.fullName, `%${f.q}%`), ilike(people.title, `%${f.q}%`), ilike(companies.name, `%${f.q}%`))
      : undefined,
  ];
  const real = conds.filter((c): c is SQL => Boolean(c));
  return real.length ? and(...real) : undefined;
}

export async function listLeads(f: LeadFilters = {}): Promise<{ items: LeadListItem[]; total: number }> {
  const db = getDb();
  const where = buildWhere(f);
  const order =
    f.sort === "priority"
      ? [desc(eventLeads.priorityScore), desc(eventLeads.totalScore)]
      : f.sort === "attendance"
        ? [desc(eventLeads.attendanceConfidence), desc(eventLeads.totalScore)]
        : f.sort === "company_fit"
          ? [desc(eventLeads.companyFitScore), desc(eventLeads.totalScore)]
          : f.sort === "newest"
            ? [desc(eventLeads.createdAt)]
            : [desc(eventLeads.totalScore), desc(eventLeads.attendanceConfidence)];

  const base = db
    .select({
      id: eventLeads.id,
      totalScore: eventLeads.totalScore,
      priorityScore: eventLeads.priorityScore,
      companyFitScore: eventLeads.companyFitScore,
      personaFitScore: eventLeads.personaFitScore,
      intentScore: eventLeads.intentScore,
      attendanceType: eventLeads.attendanceType,
      attendanceConfidence: eventLeads.attendanceConfidence,
      status: eventLeads.status,
      createdAt: eventLeads.createdAt,
      personId: people.id,
      fullName: people.fullName,
      title: people.title,
      persona: people.persona,
      email: people.email,
      emailStatus: people.emailStatus,
      linkedinUrl: people.linkedinUrl,
      companyId: companies.id,
      companyName: companies.name,
      industry: companies.industry,
      domain: companies.domain,
      eventId: events.id,
      eventName: events.name,
      evidenceCount: sql<number>`(select count(*)::int from ${leadEvidence} where ${leadEvidence.eventLeadId} = ${eventLeads.id})`,
      hubspotStatus: sql<string | null>`(select ${hubspotSyncs.status}::text from ${hubspotSyncs} where ${hubspotSyncs.eventLeadId} = ${eventLeads.id} order by ${hubspotSyncs.createdAt} desc limit 1)`,
      hubspotContactId: sql<string | null>`(select ${hubspotSyncs.hubspotContactId} from ${hubspotSyncs} where ${hubspotSyncs.eventLeadId} = ${eventLeads.id} and ${hubspotSyncs.status} = 'synced' order by ${hubspotSyncs.createdAt} desc limit 1)`,
    })
    .from(eventLeads)
    .innerJoin(people, eq(people.id, eventLeads.personId))
    .innerJoin(events, eq(events.id, eventLeads.eventId))
    .leftJoin(companies, eq(companies.id, eventLeads.companyId))
    .where(where)
    .orderBy(...order)
    .limit(Math.min(f.limit ?? 100, 500))
    .offset(f.offset ?? 0);

  const countQ = db
    .select({ n: sql<number>`count(*)::int` })
    .from(eventLeads)
    .innerJoin(people, eq(people.id, eventLeads.personId))
    .leftJoin(companies, eq(companies.id, eventLeads.companyId))
    .where(where);

  const [rows, [count]] = await Promise.all([base, countQ]);
  return {
    total: count?.n ?? 0,
    items: rows.map((r) => ({
      id: r.id,
      totalScore: r.totalScore,
      priorityScore: r.priorityScore,
      companyFitScore: r.companyFitScore,
      personaFitScore: r.personaFitScore,
      intentScore: r.intentScore,
      attendanceType: r.attendanceType,
      attendanceConfidence: r.attendanceConfidence,
      status: r.status,
      createdAt: r.createdAt,
      person: {
        id: r.personId,
        fullName: r.fullName,
        title: r.title,
        persona: r.persona,
        email: r.email,
        emailStatus: r.emailStatus,
        linkedinUrl: r.linkedinUrl,
      },
      company: r.companyId ? { id: r.companyId, name: r.companyName ?? "", industry: r.industry, domain: r.domain } : null,
      event: { id: r.eventId, name: r.eventName },
      evidenceCount: r.evidenceCount,
      hubspot: r.hubspotStatus ? { status: r.hubspotStatus, contactId: r.hubspotContactId } : null,
    })),
  };
}

export async function statusCounts(): Promise<Record<string, number>> {
  const rows = await getDb()
    .select({ status: eventLeads.status, n: sql<number>`count(*)::int` })
    .from(eventLeads)
    .groupBy(eventLeads.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

export async function distinctPersonas(): Promise<string[]> {
  const rows = await getDb().selectDistinct({ persona: people.persona }).from(people).where(sql`${people.persona} is not null`);
  return rows.map((r) => r.persona!).sort();
}

/* --------------------------------- Detail --------------------------------- */

export type LeadDetail = {
  lead: LeadRow;
  person: typeof people.$inferSelect;
  company: typeof companies.$inferSelect | null;
  event: typeof events.$inferSelect;
  evidence: EvidenceRow[];
  reviews: (typeof reviewActions.$inferSelect)[];
  syncs: (typeof hubspotSyncs.$inferSelect)[];
};

export async function getLeadDetail(id: string): Promise<LeadDetail | null> {
  const db = getDb();
  const [row] = await db
    .select({ lead: eventLeads, person: people, company: companies, event: events })
    .from(eventLeads)
    .innerJoin(people, eq(people.id, eventLeads.personId))
    .innerJoin(events, eq(events.id, eventLeads.eventId))
    .leftJoin(companies, eq(companies.id, eventLeads.companyId))
    .where(eq(eventLeads.id, id))
    .limit(1);
  if (!row) return null;
  const [evidence, reviews, syncs] = await Promise.all([
    listEvidence(id),
    db.select().from(reviewActions).where(eq(reviewActions.eventLeadId, id)).orderBy(desc(reviewActions.createdAt)),
    db.select().from(hubspotSyncs).where(eq(hubspotSyncs.eventLeadId, id)).orderBy(desc(hubspotSyncs.createdAt)),
  ]);
  return { ...row, evidence, reviews, syncs };
}

/** Leads of one event with their person/company, used for event detail + scoring. */
export async function listEventLeadRows(eventId: string) {
  return getDb()
    .select({ lead: eventLeads, person: people, company: companies })
    .from(eventLeads)
    .innerJoin(people, eq(people.id, eventLeads.personId))
    .leftJoin(companies, eq(companies.id, eventLeads.companyId))
    .where(eq(eventLeads.eventId, eventId));
}

export async function countPersonLeadFrequency(personId: string, minScore = 55): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(eventLeads)
    .where(and(eq(eventLeads.personId, personId), gte(eventLeads.totalScore, minScore)));
  return Math.max(1, row?.n ?? 1);
}

/** Ranked queue for Radar — actionable priority first. */
export async function listLeadsForCompany(companyId: string, limit = 12): Promise<LeadListItem[]> {
  const { items } = await listLeads({ limit: 200 });
  return items.filter((l) => l.company?.id === companyId).slice(0, limit);
}

export async function listTopOpportunities(limit = 10): Promise<LeadListItem[]> {
  const { items } = await listLeads({
    statuses: ["needs_review", "approved"],
    minScore: 55,
    sort: "priority",
    limit,
  });
  return items;
}

export async function countEvidenceByLead(leadIds: string[]) {
  if (!leadIds.length) return new Map<string, { n: number; urls: number }>();
  const rows = await getDb()
    .select({
      leadId: leadEvidence.eventLeadId,
      n: sql<number>`count(*)::int`,
      urls: sql<number>`count(distinct nullif(${leadEvidence.sourceUrl}, ''))::int`,
    })
    .from(leadEvidence)
    .where(inArray(leadEvidence.eventLeadId, leadIds))
    .groupBy(leadEvidence.eventLeadId);
  return new Map(rows.map((r) => [r.leadId, { n: r.n, urls: r.urls }]));
}
