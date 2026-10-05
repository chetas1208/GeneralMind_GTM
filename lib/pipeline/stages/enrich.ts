import "server-only";
import { mapSettled } from "@/lib/concurrency";
import type { EventRow } from "@/lib/db/queries/events";
import { addEvidence, listEvidenceForLeads, listEventLeadRows } from "@/lib/db/queries/leads";
import { upsertPerson } from "@/lib/db/queries/people";
import { isConfigured } from "@/lib/env";
import { ApolloPlanError } from "@/lib/integrations/apollo/client";
import { enrichPerson } from "@/lib/integrations/apollo/enrichment";
import { classifyTitle } from "@/lib/scoring/persona-score";
import { getIntelligenceBudget } from "@/lib/intelligence/budget";
import { isNegativePersona } from "@/lib/icp/exclusions";
import { isVerifiedEmailStatus } from "@/lib/contact/email-guess";
import { applyGuessedEmailForLead } from "@/lib/services/guessed-email";
import { resolveContactRoute } from "@/lib/services/contact-route";
import { computeLeadScore } from "../scoring";
import type { RunContext } from "../context";
import { EVIDENCE_CONFIDENCE } from "./shared";

const MIN_PRELIM_SCORE = 45;
const PER_STEP = 3;

const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 2));
const titlesAgree = (a: string, b: string) => {
  const x = tokens(a);
  const y = tokens(b);
  const common = [...x].filter((t) => y.has(t)).length;
  return common >= Math.max(1, Math.min(x.size, y.size) - 1);
};

/**
 * Stage D (second half): spend Apollo credits only on the strongest candidates.
 * Verified emails from Apollo when available; otherwise pattern guesses are stored as unverified.
 */
export async function runEnrichStage(ctx: RunContext, event: EventRow): Promise<boolean> {
  ctx.setStage("enriching");
  const c = ctx.cursor;

  // Without Apollo people data (key missing or plan lacks People Match) use verified public profiles.
  if (!isConfigured("APOLLO_API_KEY") || ctx.counters.apolloPeopleUnavailable) return runWebContactRoutes(ctx, event);

  if (!c.enrichQueue) {
    const budget = getIntelligenceBudget();
    const rows = await listEventLeadRows(event.id);
    const evidence = await listEvidenceForLeads(rows.map((r) => r.lead.id));
    const ranked = rows
      .filter((r) => r.company?.domain && !r.person.enrichedAt && !isNegativePersona(r.person.title))
      .map((r) => ({ id: r.lead.id, prelim: computeLeadScore({ lead: r.lead, person: r.person, company: r.company, evidence: evidence.get(r.lead.id) ?? [], event }).total }))
      .filter((r) => r.prelim >= MIN_PRELIM_SCORE)
      .sort((a, b) => b.prelim - a.prelim)
      .slice(0, budget.maxEnrichmentsPerEvent);
    c.enrichQueue = ranked.map((r) => r.id);
    c.enrichDone = 0;
    ctx.counters.enrichTarget = ranked.length;
    ctx.note(`Selective enrichment: ${ranked.length} leads (pre-score ≥ ${MIN_PRELIM_SCORE}; budget ${budget.maxEnrichmentsPerEvent})`);
  }

  const queue = c.enrichQueue ?? [];
  const start = c.enrichDone ?? 0;
  const batch = queue.slice(start, start + PER_STEP);
  const rows = await listEventLeadRows(event.id);

  const outcomes = await mapSettled(batch, 2, async (leadId) => {
    const row = rows.find((r) => r.lead.id === leadId);
    if (!row || !row.company) return null;
    const match = await enrichPerson({
      id: row.person.apolloId ?? undefined,
      firstName: row.person.firstName ?? undefined,
      lastName: row.person.lastName ?? undefined,
      domain: row.company.domain ?? undefined,
      organizationName: row.company.name,
      linkedinUrl: row.person.linkedinUrl ?? undefined,
    });
    ctx.counters.apolloCalls = (ctx.counters.apolloCalls ?? 0) + 1;
    if (!match) return `${row.person.fullName}: no Apollo match`;

    const title = match.title ?? row.person.title;
    const cls = classifyTitle(title);
    const verifiedEmail = match.email && /verified|likely/i.test(match.email_status ?? "") ? match.email : null;
    await upsertPerson({
      fullName: row.person.fullName,
      apolloId: match.id,
      companyId: row.company.id,
      title,
      seniority: match.seniority ?? (cls.seniority === "unknown" ? null : cls.seniority),
      department: match.departments?.[0] ?? null,
      email: verifiedEmail,
      emailStatus: match.email_status,
      linkedinUrl: match.linkedin_url,
      location: [match.city, match.state, match.country].filter(Boolean).join(", ") || null,
      persona: cls.inconclusive ? undefined : cls.persona,
      enrichedAt: new Date(),
    });
    const agrees = row.person.title && match.title ? titlesAgree(row.person.title, match.title) : false;
    await addEvidence({
      eventLeadId: leadId,
      sourceType: "enrichment",
      evidenceText: agrees
        ? `Apollo confirms current position: ${match.title} at ${row.company.name}.`
        : `Apollo record: ${match.title ?? "title not provided"} at ${row.company.name}${row.person.title && match.title ? ` (event page listed "${row.person.title}")` : ""}.`,
      confidence: EVIDENCE_CONFIDENCE.enrichment,
    });
    ctx.counts.peopleEnriched += 1;
    if (!verifiedEmail && row.company.domain) {
      const g = await applyGuessedEmailForLead(leadId);
      if (g.applied) return `${row.person.fullName}: enriched (guessed email ${g.email}, unverified)`;
    }
    return `${row.person.fullName}: enriched${verifiedEmail ? " (verified email)" : " (no email)"}`;
  });

  let planBlocked = false;
  outcomes.forEach((o, i) => {
    if (!o.ok) {
      if (o.error instanceof ApolloPlanError) planBlocked = true;
      else ctx.note(`Enrichment failed for lead ${batch[i].slice(0, 8)}: ${o.error instanceof Error ? o.error.message.slice(0, 160) : String(o.error)}`, "warn");
    } else if (o.value) ctx.note(o.value);
  });
  if (planBlocked) {
    ctx.counters.apolloPeopleUnavailable = true;
    ctx.note("Apollo People Match is not included in this plan – switching to verified public-profile contact routes", "warn");
    c.enrichQueue = undefined;
    return false;
  }
  c.enrichDone = start + batch.length;
  return (c.enrichDone ?? 0) >= queue.length;
}

/**
 * Contact routes without a paid people-data provider: for the strongest leads, find a public
 * profile and accept it only after deterministic verification (see `verifyProfile`).
 * Public profiles when findable; pattern email guesses when domain is known (always unverified).
 */
async function runWebContactRoutes(ctx: RunContext, event: EventRow): Promise<boolean> {
  const c = ctx.cursor;
  if (!c.enrichQueue) {
    const budget = getIntelligenceBudget();
    const rows = await listEventLeadRows(event.id);
    const evidence = await listEvidenceForLeads(rows.map((r) => r.lead.id));
    const ranked = rows
      .filter(
        (r) =>
          r.company?.domain &&
          !isNegativePersona(r.person.title) &&
          !(r.person.email && isVerifiedEmailStatus(r.person.emailStatus)),
      )
      .map((r) => ({ id: r.lead.id, prelim: computeLeadScore({ lead: r.lead, person: r.person, company: r.company, evidence: evidence.get(r.lead.id) ?? [], event }).total }))
      .filter((r) => r.prelim >= MIN_PRELIM_SCORE)
      .sort((a, b) => b.prelim - a.prelim)
      .slice(0, budget.maxEnrichmentsPerEvent);
    c.enrichQueue = ranked.map((r) => r.id);
    c.enrichDone = 0;
    ctx.counters.enrichTarget = ranked.length;
    ctx.note(`Contact routes: verified public profiles + unverified email guesses where domain is known (${ranked.length} leads).`);
  }

  const queue = c.enrichQueue ?? [];
  const start = c.enrichDone ?? 0;
  const batch = queue.slice(start, start + PER_STEP);
  const outcomes = await mapSettled(batch, 2, async (leadId) => {
    const res = await resolveContactRoute(leadId);
    const guess = await applyGuessedEmailForLead(leadId);
    if (res?.status === "found") ctx.counts.peopleEnriched += 1;
    if (guess.applied) ctx.counts.peopleEnriched += 1;
    const parts = [
      res?.status === "found" ? "verified public profile" : null,
      guess.applied ? `guessed email ${guess.email} (unverified)` : null,
    ].filter(Boolean);
    return parts.length
      ? `${leadId.slice(0, 8)}: ${parts.join("; ")}`
      : `${leadId.slice(0, 8)}: no contact route (${res?.status ?? "missing"})`;
  });
  outcomes.forEach((o, i) => {
    if (!o.ok) ctx.note(`Contact route failed for lead ${batch[i].slice(0, 8)}: ${o.error instanceof Error ? o.error.message.slice(0, 160) : String(o.error)}`, "warn");
    else ctx.note(o.value);
  });
  c.enrichDone = start + batch.length;
  return (c.enrichDone ?? 0) >= queue.length;
}
