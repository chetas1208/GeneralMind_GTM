import "server-only";
import { classifyPersona, extractParticipants } from "@/lib/ai/tasks";
import { AiValidationError } from "@/lib/ai/provider";
import { mapSettled } from "@/lib/concurrency";
import { upsertCompany, linkEventCompany } from "@/lib/db/queries/companies";
import { listEventSources, upsertEventSource, type EventRow, type EventSourceRow } from "@/lib/db/queries/events";
import { addEvidence, upsertEventLead, type AttendanceTypeValue, type EvidenceInsertType } from "@/lib/db/queries/leads";
import { upsertPerson } from "@/lib/db/queries/people";
import { gatherEventSources, ensureOverviewContent } from "@/lib/events/service";
import { scrapePage } from "@/lib/integrations/firecrawl/scrape";
import { classifyTitle } from "@/lib/scoring/persona-score";
import { findSnippet, sanitizeText } from "@/lib/text";
import type { RunContext } from "../context";
import { chunkText, EVIDENCE_CONFIDENCE, SPEAKER_ROLE } from "./shared";

const PAGES_PER_STEP = 2;
const MAX_PAGES = 14;
const KIND_PRIORITY: Record<string, number> = { speakers: 0, agenda: 1, sponsors: 2, exhibitors: 3, overview: 4, discovery: 5, other: 6 };

/** Stage A: locate and preserve the event's participant pages. */
export async function runDiscoverStage(ctx: RunContext, event: EventRow): Promise<boolean> {
  ctx.setStage("discovering");
  const gathered = await gatherEventSources(event.id);
  await ensureOverviewContent(event.id);
  const sources = (await listEventSources(event.id))
    .filter((s) => (s.content?.length ?? 0) > 200 || s.kind !== "discovery")
    .sort((a, b) => (KIND_PRIORITY[a.kind] ?? 9) - (KIND_PRIORITY[b.kind] ?? 9))
    .slice(0, MAX_PAGES);
  ctx.cursor.pageUrls = sources.map((s) => s.url);
  ctx.cursor.pagesDone = 0;
  ctx.note(
    `Evidence discovery: ${gathered.stored} participant pages found (${Object.entries(gathered.byKind)
      .map(([k, n]) => `${n} ${k}`)
      .join(", ") || "none"}) · ${sources.length} pages queued for extraction`,
  );
  return true;
}

type PageResult = { people: number; companies: number; dropped: number };

/** Stage B/E: extract participants page by page, verify against source text, persist the evidence graph. */
export async function runExtractStage(ctx: RunContext, event: EventRow): Promise<boolean> {
  ctx.setStage("extracting");
  const urls = ctx.cursor.pageUrls ?? [];
  const start = ctx.cursor.pagesDone ?? 0;
  if (start >= urls.length) return true;

  const all = await listEventSources(event.id);
  const batch = urls.slice(start, start + PAGES_PER_STEP).map((u) => all.find((s) => s.url === u)).filter((s): s is EventSourceRow => Boolean(s));

  const outcomes = await mapSettled(batch, PAGES_PER_STEP, (source) => processPage(ctx, event, source));
  outcomes.forEach((o, i) => {
    const host = safeHost(batch[i].url);
    if (!o.ok) {
      if (o.error instanceof AiValidationError) ctx.counters.aiFailures = (ctx.counters.aiFailures ?? 0) + 1;
      ctx.note(`Extraction failed for ${host}: ${o.error instanceof Error ? o.error.message.slice(0, 160) : String(o.error)}`, "warn");
    } else {
      ctx.note(`${host} (${batch[i].kind}): ${o.value.people} people, ${o.value.companies} companies persisted${o.value.dropped ? `, ${o.value.dropped} unverifiable dropped` : ""}`);
    }
  });
  ctx.cursor.pagesDone = start + PAGES_PER_STEP;
  return (ctx.cursor.pagesDone ?? 0) >= urls.length;
}

const safeHost = (u: string) => {
  try {
    return new URL(u).hostname;
  } catch {
    return u.slice(0, 40);
  }
};

async function pageText(event: EventRow, source: EventSourceRow): Promise<string> {
  let text = source.content ?? "";
  // Exa text was thin and this is a list-style page: render it with Firecrawl (once) and keep the result.
  if (text.length < 2_500 && source.kind !== "discovery") {
    try {
      const page = await scrapePage(source.url);
      text = sanitizeText(page.markdown);
      await upsertEventSource({ eventId: event.id, kind: source.kind, url: source.url, title: page.title ?? source.title, content: text.slice(0, 60_000) });
    } catch {
      /* keep Exa text; failure is non-fatal */
    }
  }
  return text;
}

async function processPage(ctx: RunContext, event: EventRow, source: EventSourceRow): Promise<PageResult> {
  const text = await pageText(event, source);
  const result: PageResult = { people: 0, companies: 0, dropped: 0 };
  if (text.length < 300) return result;

  for (const chunk of chunkText(text)) {
    const extraction = await extractParticipants({ eventName: event.name, pageKind: source.kind, text: chunk });

    /* Companies listed on the official page */
    for (const co of extraction.companies) {
      const snippet = findSnippet(chunk, co.name, 160);
      if (!snippet) {
        result.dropped++;
        continue;
      }
      const company = await upsertCompany({ name: co.name });
      const assoc = co.relationship === "unknown" ? mapKindToAssociation(source.kind) : co.relationship;
      await linkEventCompany({
        eventId: event.id,
        companyId: company.id,
        associationType: assoc,
        confidence: 90,
        sourceUrl: source.url,
        sourceTitle: source.title,
        evidenceText: snippet,
      });
      result.companies++;
    }

    /* People: every claim must be verifiable in the source text */
    for (const p of extraction.people) {
      const snippet = findSnippet(chunk, p.name, 260);
      if (!snippet || !p.company) {
        result.dropped++;
        continue;
      }
      let cls = classifyTitle(p.title);
      // Unusual title the rules cannot place: ask the model for a *category only* (bounded per run).
      if (cls.inconclusive && p.title && (ctx.counters.personaAiCalls ?? 0) < 12) {
        ctx.counters.personaAiCalls = (ctx.counters.personaAiCalls ?? 0) + 1;
        try {
          const ai = await classifyPersona(p.title);
          cls = { persona: ai.persona, seniority: cls.seniority === "unknown" ? ai.seniority : cls.seniority, inconclusive: false };
        } catch {
          /* leave as unclassified */
        }
      }
      if (cls.persona === "other") continue; // not a buying-committee persona; do not clutter the queue

      const isSpeaker = source.kind === "speakers" || source.kind === "agenda" || SPEAKER_ROLE.test(p.role ?? "");
      let attendance: AttendanceTypeValue;
      let evidenceType: EvidenceInsertType;
      if (isSpeaker) {
        attendance = "official_speaker";
        evidenceType = source.kind === "agenda" ? "agenda" : "official_speaker";
      } else if (source.kind === "exhibitors") {
        attendance = "exhibitor_employee";
        evidenceType = "official_exhibitor";
      } else if (source.kind === "sponsors") {
        attendance = "sponsor_employee";
        evidenceType = "official_sponsor";
      } else {
        continue; // no role evidence → refuse to guess attendance
      }

      const company = await upsertCompany({ name: p.company });
      const person = await upsertPerson({
        fullName: p.name,
        title: p.title,
        companyId: company.id,
        persona: cls.inconclusive ? undefined : cls.persona,
        seniority: cls.seniority === "unknown" ? undefined : cls.seniority,
      });
      await linkEventCompany({
        eventId: event.id,
        companyId: company.id,
        associationType: isSpeaker ? "speaker_company" : attendance === "exhibitor_employee" ? "exhibitor" : "sponsor",
        confidence: isSpeaker ? 70 : 85,
        sourceUrl: source.url,
        sourceTitle: source.title,
        evidenceText: snippet,
      });
      const { lead } = await upsertEventLead({ eventId: event.id, personId: person.id, companyId: company.id, attendanceType: attendance });
      await addEvidence({
        eventLeadId: lead.id,
        sourceType: evidenceType,
        sourceUrl: source.url,
        sourceTitle: source.title,
        evidenceText: isSpeaker
          ? `Listed on the official ${source.kind === "agenda" ? "agenda" : "speaker"} page: ${snippet}`
          : `Listed on the official ${source.kind} page (attendance of this person is not confirmed): ${snippet}`,
        confidence: EVIDENCE_CONFIDENCE[evidenceType],
      });
      result.people++;
    }
  }
  return result;
}

function mapKindToAssociation(kind: string): "sponsor" | "exhibitor" | "partner" | "unknown" {
  if (kind === "sponsors") return "sponsor";
  if (kind === "exhibitors") return "exhibitor";
  return "unknown";
}
