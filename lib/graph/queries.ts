import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  companies,
  eventCompanies,
  eventLeads,
  events,
  leadEvidence,
  people,
  signalClusters,
  signals,
} from "@/lib/db/schema";
import { getLeadDetail } from "@/lib/db/queries/leads";
import { listEventLeadRows } from "@/lib/db/queries/leads";

export { getLeadDetail, listEventLeadRows };

export async function fetchCompanySignals(companyId: string, limit = 8) {
  return getDb()
    .select()
    .from(signals)
    .where(and(eq(signals.companyId, companyId), eq(signals.status, "verified")))
    .orderBy(desc(signals.confidence), desc(signals.discoveredAt))
    .limit(limit);
}

export async function fetchSignalClusters(companyId: string) {
  return getDb().select().from(signalClusters).where(eq(signalClusters.companyId, companyId));
}

export async function fetchEventCompanies(eventId: string) {
  return getDb()
    .select({ link: eventCompanies, company: companies })
    .from(eventCompanies)
    .innerJoin(companies, eq(companies.id, eventCompanies.companyId))
    .where(eq(eventCompanies.eventId, eventId));
}

export async function fetchEventRow(eventId: string) {
  const [row] = await getDb().select().from(events).where(eq(events.id, eventId)).limit(1);
  return row ?? null;
}

export async function fetchCompanyRow(companyId: string) {
  const [row] = await getDb().select().from(companies).where(eq(companies.id, companyId)).limit(1);
  return row ?? null;
}

export async function fetchMarketSlice(opts: { minScore?: number; limitEvents?: number; limitLeads?: number }) {
  const minScore = opts.minScore ?? 55;
  const db = getDb();
  const topEvents = await db
    .select({ event: events, leadCount: sql<number>`count(${eventLeads.id})::int` })
    .from(events)
    .innerJoin(eventLeads, eq(eventLeads.eventId, events.id))
    .where(gte(eventLeads.totalScore, minScore))
    .groupBy(events.id)
    .orderBy(desc(sql`count(${eventLeads.id})`))
    .limit(opts.limitEvents ?? 6);

  const leads = await db
    .select({ lead: eventLeads, person: people, company: companies, event: events })
    .from(eventLeads)
    .innerJoin(people, eq(people.id, eventLeads.personId))
    .innerJoin(events, eq(events.id, eventLeads.eventId))
    .leftJoin(companies, eq(companies.id, eventLeads.companyId))
    .where(gte(eventLeads.totalScore, minScore))
    .orderBy(desc(eventLeads.priorityScore))
    .limit(opts.limitLeads ?? 15);

  const companyIds = [...new Set(leads.map((r) => r.company?.id).filter(Boolean) as string[])];
  const companySignals =
    companyIds.length > 0
      ? await db
          .select()
          .from(signals)
          .where(and(inArray(signals.companyId, companyIds), eq(signals.status, "verified")))
          .orderBy(desc(signals.confidence))
          .limit(24)
      : [];

  return { topEvents, leads, companySignals };
}

export async function fetchEvidenceForLeads(leadIds: string[]) {
  if (!leadIds.length) return [];
  return getDb().select().from(leadEvidence).where(inArray(leadEvidence.eventLeadId, leadIds));
}
