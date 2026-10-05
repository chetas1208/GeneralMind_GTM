import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { companies, eventLeads, events, people, reviewActions, signals, sourceRuns } from "@/lib/db/schema";
import { BAND_LABEL, type ConfidenceBand } from "@/lib/confidence";
import { signalTypeLabel } from "@/lib/gtm-present";
import type { ActivityItem } from "./types";

export async function loadActivity(limit = 12): Promise<ActivityItem[]> {
  const db = getDb();
  const [reviews, sigs, runs] = await Promise.all([
    db
      .select({
        id: reviewActions.id,
        action: reviewActions.action,
        at: reviewActions.createdAt,
        name: people.fullName,
        leadId: eventLeads.id,
      })
      .from(reviewActions)
      .innerJoin(eventLeads, eq(eventLeads.id, reviewActions.eventLeadId))
      .innerJoin(people, eq(people.id, eventLeads.personId))
      .orderBy(desc(reviewActions.createdAt))
      .limit(8),
    db
      .select({
        id: signals.id,
        type: signals.type,
        title: signals.title,
        at: signals.discoveredAt,
        company: companies.name,
        companyId: companies.id,
      })
      .from(signals)
      .innerJoin(companies, eq(companies.id, signals.companyId))
      .where(eq(signals.status, "verified"))
      .orderBy(desc(signals.discoveredAt))
      .limit(8),
    db
      .select({
        id: sourceRuns.id,
        kind: sourceRuns.kind,
        status: sourceRuns.status,
        at: sourceRuns.completedAt,
        eventName: events.name,
        eventId: events.id,
        companiesFound: sourceRuns.companiesFound,
        peopleFound: sourceRuns.peopleFound,
        leadsQualified: sourceRuns.leadsQualified,
      })
      .from(sourceRuns)
      .leftJoin(events, eq(events.id, sourceRuns.eventId))
      .orderBy(desc(sourceRuns.updatedAt))
      .limit(6),
  ]);

  const items: ActivityItem[] = [
    ...reviews.map((r) => ({
      id: `review-${r.id}`,
      type: r.action === "approve" ? "opportunity_approved" : r.action === "reject" ? "opportunity_rejected" : "review",
      title: r.action === "approve" ? `${r.name} approved` : r.action === "reject" ? `${r.name} passed` : `${r.name} updated`,
      description: "Human review",
      occurredAt: r.at.toISOString(),
      href: `/leads?lead=${r.leadId}`,
    })),
    ...sigs.map((s) => ({
      id: `sig-${s.id}`,
      type: "signal_discovered",
      title: `${signalTypeLabel(s.type)} · ${s.company}`,
      description: s.title.slice(0, 120),
      occurredAt: s.at.toISOString(),
      href: `/accounts/${s.companyId}`,
    })),
    ...runs
      .filter((r) => r.status === "complete" && r.at)
      .map((r) => ({
        id: `run-${r.id}`,
        type: r.kind === "event_discovery" ? "event_discovered" : "event_sourced",
        title: r.kind === "event_discovery" ? "Event discovery completed" : `${r.eventName ?? "Event"} research completed`,
        description: `${r.companiesFound} companies · ${r.peopleFound} people · ${r.leadsQualified} ready for review`,
        occurredAt: r.at!.toISOString(),
        href: r.eventId ? `/events/${r.eventId}` : "/radar",
      })),
  ];

  items.push(...(await confidenceChangeItems()));
  return items.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)).slice(0, limit);
}

export async function loadAccountActivity(companyId: string, limit = 20): Promise<ActivityItem[]> {
  const db = getDb();
  const [sigs, reviews] = await Promise.all([
    db
      .select({
        id: signals.id,
        type: signals.type,
        title: signals.title,
        at: signals.discoveredAt,
      })
      .from(signals)
      .where(eq(signals.companyId, companyId))
      .orderBy(desc(signals.discoveredAt))
      .limit(12),
    db
      .select({
        id: reviewActions.id,
        action: reviewActions.action,
        at: reviewActions.createdAt,
        name: people.fullName,
        leadId: eventLeads.id,
      })
      .from(reviewActions)
      .innerJoin(eventLeads, eq(eventLeads.id, reviewActions.eventLeadId))
      .innerJoin(people, eq(people.id, eventLeads.personId))
      .where(eq(eventLeads.companyId, companyId))
      .orderBy(desc(reviewActions.createdAt))
      .limit(12),
  ]);
  const items: ActivityItem[] = [
    ...sigs.map((s) => ({
      id: `sig-${s.id}`,
      type: "signal_discovered",
      title: signalTypeLabel(s.type),
      description: s.title.slice(0, 140),
      occurredAt: s.at.toISOString(),
      href: `/accounts/${companyId}`,
    })),
    ...reviews.map((r) => ({
      id: `review-${r.id}`,
      type: r.action,
      title: r.action === "approve" ? `${r.name} approved` : r.action === "reject" ? `${r.name} passed` : `${r.name} updated`,
      description: "Review on this account",
      occurredAt: r.at.toISOString(),
      href: `/leads?lead=${r.leadId}`,
    })),
  ];
  items.push(...(await confidenceChangeItems(companyId)));
  return items.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)).slice(0, limit);
}

async function confidenceChangeItems(companyId?: string): Promise<ActivityItem[]> {
  const rows = await getDb()
    .select({
      id: eventLeads.id,
      name: people.fullName,
      assessment: eventLeads.confidenceAssessment,
      at: eventLeads.updatedAt,
    })
    .from(eventLeads)
    .innerJoin(people, eq(people.id, eventLeads.personId))
    .where(companyId ? eq(eventLeads.companyId, companyId) : sql`${eventLeads.confidenceAssessment}->>'changeReason' <> ''`)
    .orderBy(desc(eventLeads.updatedAt))
    .limit(8);
  return rows.flatMap((r) => {
    const previous = r.assessment?.previousBand;
    const current = r.assessment?.label;
    const reason = r.assessment?.changeReason;
    if (!previous || !current || !reason) return [];
    return [{
      id: `confidence-${r.id}`,
      type: "confidence_changed",
      title: `Confidence changed · ${r.name}`,
      description: `${BAND_LABEL[previous as ConfidenceBand] ?? previous} → ${current}. ${r.assessment?.summary ?? reason}`,
      occurredAt: r.assessment?.assessedAt ?? r.at.toISOString(),
      href: `/leads?lead=${r.id}`,
    }];
  });
}
