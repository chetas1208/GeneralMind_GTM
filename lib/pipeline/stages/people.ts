import "server-only";
import { extractProfileRole } from "@/lib/ai/tasks";
import { mapSettled } from "@/lib/concurrency";
import { getCompany, listEventCompanies, type CompanyRow, type EventCompanyListItem } from "@/lib/db/queries/companies";
import type { EventRow } from "@/lib/db/queries/events";
import { addEvidence, upsertEventLead, type AttendanceTypeValue, type EvidenceInsertType } from "@/lib/db/queries/leads";
import { upsertPerson } from "@/lib/db/queries/people";
import { isConfigured } from "@/lib/env";
import { ApolloPlanError } from "@/lib/integrations/apollo/client";
import { searchPeopleAtCompany } from "@/lib/integrations/apollo/people";
import { exaSearch } from "@/lib/integrations/exa/search";
import { isNegativePersona } from "@/lib/icp/exclusions";
import { getIntelligenceBudget } from "@/lib/intelligence/budget";
import { classifyTitle } from "@/lib/scoring/persona-score";
import { findSnippet, normalizeLinkedin } from "@/lib/text";
import type { RunContext } from "../context";
import { ATTENDANCE_BY_ASSOCIATION, EVIDENCE_CONFIDENCE, namesMatch } from "./shared";

const PER_STEP = 2;
const ASSOC_ORDER = ["speaker_company", "exhibitor", "sponsor", "partner", "organizer", "public_attendance", "unknown"];

const strongestAssociation = (c: EventCompanyListItem) =>
  [...c.associations].sort((a, b) => ASSOC_ORDER.indexOf(a.type) - ASSOC_ORDER.indexOf(b.type) || b.confidence - a.confidence)[0];

const TARGET_SENIORITY = new Set(["c_suite", "vp", "head", "director"]);

/** Stage D: find a limited number of target-persona people at each qualified company. */
export async function runPeopleStage(ctx: RunContext, event: EventRow): Promise<boolean> {
  ctx.setStage("finding_people");
  const c = ctx.cursor;

  if (!c.peopleQueue) {
    const budget = getIntelligenceBudget();
    const linked = await listEventCompanies(event.id);
    const qualified = new Set(c.qualifiedCompanyIds ?? []);
    c.peopleQueue = linked
      .filter((l) => qualified.has(l.companyId))
      .sort((a, b) => (b.companyFitScore ?? 0) - (a.companyFitScore ?? 0))
      .slice(0, budget.maxCompaniesPerEvent)
      .map((l) => l.companyId);
    c.peopleDone = 0;
    ctx.counters.candidatePeople = 0;
    ctx.note(`People search (0-credit) across ${c.peopleQueue.length} qualified accounts · up to ${budget.maxPeopleSearchPerCompany} candidates each`);
  }

  const queue = c.peopleQueue ?? [];
  const start = c.peopleDone ?? 0;
  const batch = queue.slice(start, start + PER_STEP);
  const linked = await listEventCompanies(event.id);

  const outcomes = await mapSettled(batch, PER_STEP, async (companyId) => {
    const company = await getCompany(companyId);
    const link = linked.find((l) => l.companyId === companyId);
    if (!company || !link) return "skipped";
    return findPersonas(ctx, event, company, link);
  });
  outcomes.forEach((o, i) => {
    if (!o.ok) ctx.note(`Persona search failed for company ${batch[i].slice(0, 8)}: ${o.error instanceof Error ? o.error.message.slice(0, 180) : String(o.error)}`, "warn");
    else if (typeof o.value === "string" && o.value !== "skipped") ctx.note(o.value);
  });
  c.peopleDone = start + batch.length;
  return (c.peopleDone ?? 0) >= queue.length;
}

async function findPersonas(ctx: RunContext, event: EventRow, company: CompanyRow, link: EventCompanyListItem): Promise<string> {
  const budget = getIntelligenceBudget();
  const peopleCap = budget.maxPeopleSearchPerCompany;
  const assoc = strongestAssociation(link);
  const attendance = ATTENDANCE_BY_ASSOCIATION[assoc?.type ?? "unknown"];

  // Preferred: Apollo people search (credit-free, needs paid plan).
  if (company.domain && isConfigured("APOLLO_API_KEY") && !ctx.counters.apolloPeopleUnavailable) {
    try {
      const found = await searchPeopleAtCompany({ domain: company.domain, limit: peopleCap });
      ctx.counters.apolloPeopleSearch = (ctx.counters.apolloPeopleSearch ?? 0) + found.length;
      let n = 0;
      for (const p of found) {
        const name = [p.first_name, p.last_name ?? p.last_name_obfuscated].filter(Boolean).join(" ").trim();
        if (!name || !p.title) continue;
        if (isNegativePersona(p.title)) continue;
        const cls = classifyTitle(p.title);
        if (cls.persona === "other") continue;
        if (!TARGET_SENIORITY.has(cls.seniority) && cls.seniority !== "manager") continue;
        const person = await upsertPerson({
          fullName: name,
          title: p.title,
          apolloId: p.id,
          companyId: company.id,
          persona: cls.persona,
          seniority: cls.seniority,
        });
        await attachCompanyEvidence(event, company, link, person.id, attendance, `Directory lists ${name} as ${p.title} at ${company.name}.`, "enrichment");
        n++;
        ctx.counters.candidatePeople = (ctx.counters.candidatePeople ?? 0) + 1;
      }
      ctx.counts.peopleFound += n;
      return `${company.name}: ${n} target personas (${found.length} searched)`;
    } catch (e) {
      if (!(e instanceof ApolloPlanError)) throw e;
      ctx.counters.apolloPeopleUnavailable = true;
      ctx.note("Apollo People Search is not included in this plan – falling back to public-web persona discovery (no emails will be available)", "warn");
    }
  }

  return findPersonasViaWeb(ctx, event, company, link, attendance);
}

async function findPersonasViaWeb(
  ctx: RunContext,
  event: EventRow,
  company: CompanyRow,
  link: EventCompanyListItem,
  attendance: AttendanceTypeValue,
): Promise<string> {
  const peopleCap = getIntelligenceBudget().maxPeopleSearchPerCompany;
  const { results } = await exaSearch({
    query: `${company.name} VP or Director of Supply Chain, Procurement, Operations, Order Management, Finance Operations or ERP`,
    category: "people",
    numResults: 8,
    maxCharacters: 3_000,
  });
  const profiles = results.filter((r) => /linkedin\.com\/in\//i.test(r.url) && (r.text?.length ?? 0) > 200).slice(0, 6);

  let accepted = 0;
  const checks = await mapSettled(profiles, 3, async (r) => {
    const text = r.text ?? "";
    const role = await extractProfileRole({ url: r.url, text });
    if (!role.isCurrent || !role.currentTitle || !role.currentCompany || !role.quote) return null;
    // Anti-hallucination: the quoted role must literally appear in the profile text.
    if (!findSnippet(text, role.quote.slice(0, 120), 10)) return null;
    if (!namesMatch(role.currentCompany, company.name)) return null;
    const cls = classifyTitle(role.currentTitle);
    if (cls.persona === "other" || !TARGET_SENIORITY.has(cls.seniority)) return null;
    const fullName = (role.fullName ?? r.title ?? "").replace(/\s*[|–-]\s*LinkedIn.*$/i, "").trim();
    if (fullName.split(/\s+/).length < 2) return null;
    return { r, role, cls, fullName };
  });

  for (const check of checks) {
    if (!check.ok || !check.value || accepted >= peopleCap) continue;
    if (isNegativePersona(check.value.role.currentTitle)) continue;
    const { r, role, cls, fullName } = check.value;
    const person = await upsertPerson({
      fullName,
      title: role.currentTitle,
      companyId: company.id,
      linkedinUrl: normalizeLinkedin(r.url),
      persona: cls.persona,
      seniority: cls.seniority,
    });
    const { lead } = await upsertEventLead({ eventId: event.id, personId: person.id, companyId: company.id, attendanceType: attendance });
    await addEvidence({
      eventLeadId: lead.id,
      sourceType: "public_web",
      sourceUrl: r.url,
      sourceTitle: r.title,
      evidenceText: `Public profile snapshot states current role "${role.quote}". Self-published; not independently verified.`,
      confidence: EVIDENCE_CONFIDENCE.public_web + 15,
    });
    await attachCompanyEvidence(event, company, link, person.id, attendance);
    accepted++;
  }
  ctx.counts.peopleFound += accepted;
  return `${company.name}: ${accepted} personas via public web (${profiles.length} profiles reviewed)`;
}

/** Company-level participation evidence, worded so it never implies the *person* is attending. */
async function attachCompanyEvidence(
  event: EventRow,
  company: CompanyRow,
  link: EventCompanyListItem,
  personId: string,
  attendance: AttendanceTypeValue,
  extraText?: string,
  extraType?: EvidenceInsertType,
) {
  const assoc = strongestAssociation(link);
  const { lead } = await upsertEventLead({ eventId: event.id, personId, companyId: company.id, attendanceType: attendance });
  const type: EvidenceInsertType =
    assoc?.type === "exhibitor" ? "official_exhibitor" : assoc?.type === "sponsor" || assoc?.type === "partner" ? "official_sponsor" : "inference";
  const label = assoc?.type === "speaker_company" ? "has a speaker at" : assoc?.type === "exhibitor" ? "is listed as an exhibitor at" : assoc?.type === "sponsor" ? "is listed as a sponsor of" : assoc?.type === "partner" ? "is listed as a partner of" : "is associated with";
  await addEvidence({
    eventLeadId: lead.id,
    sourceType: type,
    sourceUrl: assoc?.sourceUrl ?? "",
    sourceTitle: null,
    evidenceText: `${company.name} ${label} ${event.name}${assoc?.evidenceText ? ` — "${assoc.evidenceText.slice(0, 220)}"` : ""}. This person's own attendance is NOT confirmed.`,
    confidence: type === "inference" ? EVIDENCE_CONFIDENCE.inference + 10 : EVIDENCE_CONFIDENCE[type],
  });
  if (extraText && extraType) {
    await addEvidence({ eventLeadId: lead.id, sourceType: extraType, evidenceText: extraText, confidence: EVIDENCE_CONFIDENCE[extraType] });
  }
}
