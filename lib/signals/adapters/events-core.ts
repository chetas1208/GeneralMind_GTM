import { eq } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { eventCompanies, eventLeads, events, people } from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";
import { daysUntil } from "@/lib/scoring/event-score";
import { attachDedupe } from "../normalize";
import type { SignalCandidate, SignalDiscoveryInput, VerifiedSignal } from "../types";

type Db = NeonHttpDatabase<typeof schema>;

export async function discoverEventSignals(db: Db, input: SignalDiscoveryInput): Promise<SignalCandidate[]> {
  const links = await db
    .select({
      event: events,
      assoc: eventCompanies.associationType,
      evidenceText: eventCompanies.evidenceText,
      sourceUrl: eventCompanies.sourceUrl,
    })
    .from(eventCompanies)
    .innerJoin(events, eq(events.id, eventCompanies.eventId))
    .where(eq(eventCompanies.companyId, input.companyId));

  const leads = await db
    .select({ lead: eventLeads, person: people, event: events })
    .from(eventLeads)
    .innerJoin(people, eq(people.id, eventLeads.personId))
    .innerJoin(events, eq(events.id, eventLeads.eventId))
    .where(eq(eventLeads.companyId, input.companyId));

  const out: SignalCandidate[] = [];

  for (const l of links) {
    const days = daysUntil(l.event.startDate);
    const urgency = days !== null && days >= 0 && days <= 45 ? 90 : days !== null && days <= 120 ? 70 : 40;
    out.push({
      type: "event",
      direction: "positive",
      title: `Participating in ${l.event.name}`,
      summary: `${input.companyName} is linked to ${l.event.name} as ${l.assoc.replace(/_/g, " ")}.`,
      sourceUrl: l.sourceUrl || l.event.websiteUrl || "",
      sourceTitle: l.event.name,
      evidenceText: l.evidenceText ?? undefined,
      eventId: l.event.id,
      confidence: 88,
      relevance: Math.min(100, l.event.relevanceScore ?? 70),
      urgency,
      workflowHints: ["purchase_order_creation", "supplier_communication"],
      occurredAt: l.event.startDate ? new Date(`${l.event.startDate}T00:00:00Z`) : null,
    });
  }

  for (const { lead, person, event } of leads) {
    if (lead.attendanceType === "inferred") continue;
    const days = daysUntil(event.startDate);
    out.push({
      type: "event",
      direction: "positive",
      title: `${person.fullName} — ${event.name}`,
      summary: `${person.title ?? "Contact"} tied to ${event.name} (${lead.attendanceType.replace(/_/g, " ")}).`,
      sourceUrl: event.websiteUrl ?? "",
      eventId: event.id,
      eventLeadId: lead.id,
      personId: person.id,
      confidence: Math.min(99, lead.attendanceConfidence),
      relevance: event.relevanceScore ?? 75,
      urgency: days !== null && days <= 30 ? 95 : 60,
      workflowHints: ["purchase_order_creation"],
      occurredAt: event.startDate ? new Date(`${event.startDate}T00:00:00Z`) : null,
    });
  }
  return out;
}

export function verifyEventSignal(candidate: SignalCandidate, input: SignalDiscoveryInput): VerifiedSignal | null {
  if (!candidate.eventId && !candidate.sourceUrl) return null;
  return attachDedupe(input.companyId, { ...candidate, confidence: Math.max(candidate.confidence, 85) });
}
