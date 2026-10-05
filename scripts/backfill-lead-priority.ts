/**
 * One-off: populate priority_score / opportunity_hypothesis for leads scored before icp-v2.
 * Run: pnpm exec tsx scripts/backfill-lead-priority.ts
 */
import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { computeLeadPriority } from "../lib/intelligence/ranking/lead-priority";
import { inferOpportunityHypothesis } from "../lib/icp/opportunity";
import { and, gte, sql as dsql } from "drizzle-orm";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql, { schema });
  const rows = await db
    .select({
      lead: schema.eventLeads,
      person: schema.people,
      company: schema.companies,
      event: schema.events,
    })
    .from(schema.eventLeads)
    .innerJoin(schema.people, eq(schema.people.id, schema.eventLeads.personId))
    .innerJoin(schema.events, eq(schema.events.id, schema.eventLeads.eventId))
    .leftJoin(schema.companies, eq(schema.companies.id, schema.eventLeads.companyId));

  let n = 0;
  for (const r of rows) {
    const [freqRow] = await db
      .select({ n: dsql<number>`count(*)::int` })
      .from(schema.eventLeads)
      .where(and(eq(schema.eventLeads.personId, r.person.id), gte(schema.eventLeads.totalScore, 55)));
    const signalFrequency = Math.max(1, freqRow?.n ?? 1);
    const priorityScore = computeLeadPriority({
      totalScore: r.lead.totalScore,
      attendanceType: r.lead.attendanceType,
      attendanceConfidence: r.lead.attendanceConfidence,
      eventStartDate: r.event.startDate,
      hasWorkEmail: Boolean(r.person.email),
      hasVerifiedProfile: Boolean(r.person.linkedinUrl),
      signalFrequency,
      reviewStatus: r.lead.status,
    });
    const opportunityHypothesis = inferOpportunityHypothesis({
      persona: (r.person.persona as import("../lib/icp/types").Persona | null) ?? null,
      operationalSignals: r.company?.operationalSignals ?? [],
      erpSignals: r.company?.erpSignals ?? [],
      description: r.company?.description,
      attendanceConfirmed: r.lead.attendanceType === "official_speaker" || r.lead.attendanceType === "public_attendance",
    });
    await db
      .update(schema.eventLeads)
      .set({ priorityScore, signalFrequency, opportunityHypothesis, updatedAt: new Date() })
      .where(eq(schema.eventLeads.id, r.lead.id));
    n++;
  }
  console.log(`Backfilled ${n} leads`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
