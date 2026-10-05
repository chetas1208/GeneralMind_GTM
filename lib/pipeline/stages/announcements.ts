import "server-only";
import { mapSettled } from "@/lib/concurrency";
import { getCompany, listEventCompanies } from "@/lib/db/queries/companies";
import { eventDomain, type EventRow } from "@/lib/db/queries/events";
import { addEvidence, listEventLeadRows, upsertEventLead } from "@/lib/db/queries/leads";
import { exaSearch } from "@/lib/integrations/exa/search";
import { CONFIRMED_ATTENDANCE } from "@/lib/scoring/config";
import { findSnippet, stripAccents } from "@/lib/text";
import type { RunContext } from "../context";
import { EVIDENCE_CONFIDENCE } from "./shared";

const PHRASE = /\b(attend(ing|s|ed)?|speak(ing|s)?|present(ing|s)?|join(ing)?(?: us)?|will be (?:at|in)|see (?:us|me) at|visit (?:us|our)|booth|panelist|keynote|registered|exhibit(ing)?)\b/i;
const MAX_PEOPLE = 8;
const MAX_COMPANIES = 5;
const PER_STEP = 3;

/** Core event name without the year, e.g. "MODEX 2027" → "modex". */
const coreName = (name: string) => stripAccents(name).toLowerCase().replace(/\b20\d{2}\b/g, "").replace(/\s+/g, " ").trim();

function windowAround(text: string, needle: string): string | null {
  return findSnippet(text, needle, 260);
}

/**
 * Stage A (second half): "<person> <event>" and "<company> attending <event>" searches.
 * Only upgrades attendance when a public page states participation in plain language
 * next to the person's name; otherwise it records weaker corroboration.
 */
export async function runAnnouncementsStage(ctx: RunContext, event: EventRow): Promise<boolean> {
  ctx.setStage("verifying");
  const c = ctx.cursor;
  const domain = eventDomain(event.websiteUrl);
  const eventCore = coreName(event.name);

  if (!c.announcementQueue) {
    const rows = await listEventLeadRows(event.id);
    const qualified = new Set(c.qualifiedCompanyIds ?? []);
    const people = rows
      .filter((r) => !CONFIRMED_ATTENDANCE.has(r.lead.attendanceType) && r.lead.companyId && qualified.has(r.lead.companyId))
      .sort((a, b) => (b.company?.companyFitScore ?? 0) - (a.company?.companyFitScore ?? 0))
      .slice(0, MAX_PEOPLE)
      .map((r) => `p:${r.lead.id}`);
    const companies = (await listEventCompanies(event.id))
      .filter((l) => qualified.has(l.companyId))
      .slice(0, MAX_COMPANIES)
      .map((l) => `c:${l.companyId}`);
    c.announcementQueue = [...people, ...companies];
    c.announcementsDone = 0;
    ctx.note(`Announcement search: ${people.length} people + ${companies.length} companies`);
  }

  const queue = c.announcementQueue ?? [];
  const start = c.announcementsDone ?? 0;
  const batch = queue.slice(start, start + PER_STEP);

  const outcomes = await mapSettled(batch, PER_STEP, async (item) => {
    const [kind, id] = [item.slice(0, 1), item.slice(2)];
    if (kind === "p") return personSearch(ctx, event, id, domain, eventCore);
    return companySearch(event, id, domain, eventCore);
  });
  outcomes.forEach((o) => {
    if (!o.ok) ctx.note(`Announcement search failed: ${o.error instanceof Error ? o.error.message.slice(0, 160) : String(o.error)}`, "warn");
    else if (o.value) ctx.note(o.value);
  });
  c.announcementsDone = start + batch.length;
  return (c.announcementsDone ?? 0) >= queue.length;
}

async function personSearch(ctx: RunContext, event: EventRow, leadId: string, domain: string | null, eventCore: string): Promise<string | null> {
  const rows = await listEventLeadRows(event.id);
  const row = rows.find((r) => r.lead.id === leadId);
  if (!row) return null;
  const name = row.person.fullName;
  const { results } = await exaSearch({
    query: `"${name}" "${event.name}" attending OR speaking OR booth`,
    numResults: 5,
    maxCharacters: 2_500,
  });
  let upgraded = false;
  let corroborated = 0;
  for (const r of results) {
    const text = `${r.title ?? ""}\n${r.text ?? ""}`;
    const snippet = windowAround(text, name);
    if (!snippet || !stripAccents(text).toLowerCase().includes(eventCore)) continue;
    const official = domain ? r.url.includes(domain) : false;
    if (PHRASE.test(snippet)) {
      await addEvidence({
        eventLeadId: leadId,
        sourceType: official ? "official_attendee" : "person_announcement",
        sourceUrl: r.url,
        sourceTitle: r.title,
        evidenceText: `Public page mentions ${name} in connection with ${event.name}: ${snippet}`,
        confidence: official ? 85 : EVIDENCE_CONFIDENCE.person_announcement,
      });
      await upsertEventLead({ eventId: event.id, personId: row.person.id, companyId: row.lead.companyId, attendanceType: "public_attendance" });
      upgraded = true;
      corroborated++;
    } else {
      await addEvidence({
        eventLeadId: leadId,
        sourceType: "public_web",
        sourceUrl: r.url,
        sourceTitle: r.title,
        evidenceText: `Page mentions both ${name} and ${event.name}, but does not state attendance: ${snippet}`,
        confidence: 35,
      });
    }
  }
  return `${name}: ${upgraded ? `public attendance statement found (${corroborated} source${corroborated === 1 ? "" : "s"})` : "no public attendance statement found"}`;
}

async function companySearch(event: EventRow, companyId: string, domain: string | null, eventCore: string): Promise<string | null> {
  const company = await getCompany(companyId);
  if (!company) return null;
  const { results } = await exaSearch({
    query: `"${company.name}" attending OR exhibiting OR sponsoring "${event.name}"`,
    numResults: 5,
    maxCharacters: 2_500,
  });
  const hits = results.filter((r) => !(domain && r.url.includes(domain)));
  const rows = (await listEventLeadRows(event.id)).filter((r) => r.lead.companyId === companyId);
  let attached = 0;
  for (const r of hits) {
    const text = `${r.title ?? ""}\n${r.text ?? ""}`;
    const snippet = windowAround(text, company.name);
    if (!snippet || !PHRASE.test(snippet) || !stripAccents(text).toLowerCase().includes(eventCore)) continue;
    for (const row of rows) {
      await addEvidence({
        eventLeadId: row.lead.id,
        sourceType: "company_announcement",
        sourceUrl: r.url,
        sourceTitle: r.title,
        evidenceText: `Third-party/company page ties ${company.name} to ${event.name}: ${snippet}. This does not confirm that ${row.person.fullName} personally attends.`,
        confidence: EVIDENCE_CONFIDENCE.company_announcement,
      });
    }
    attached++;
  }
  return `${company.name}: ${attached} company-level announcement${attached === 1 ? "" : "s"} found`;
}
