import "server-only";
import { eq, sql } from "drizzle-orm";
import { extractProfileRole } from "@/lib/ai/tasks";
import {
  companySearchAliases,
  isLinkedinProfileUrl,
  verifyByExperience,
  verifyByHeadline,
  verifyProfile,
  worthReading,
} from "@/lib/contact/profile-match";
import { getDb } from "@/lib/db";
import { getCompany } from "@/lib/db/queries/companies";
import { addEvidence, getLeadRow } from "@/lib/db/queries/leads";
import { getPerson, upsertPerson } from "@/lib/db/queries/people";
import { eventLeads } from "@/lib/db/schema";
import { dedupeByUrl, exaSearch } from "@/lib/integrations/exa/search";
import type { ExaResult } from "@/lib/integrations/exa/schemas";
import type { PersonRow } from "@/lib/db/queries/people";
import type { CompanyRow } from "@/lib/db/queries/companies";
import { createLogger } from "@/lib/logger";
import { updateAccountIntelligence } from "@/lib/signals/refresh";
import { isVerifiedEmailStatus } from "@/lib/contact/email-guess";
import { PROFILE_ROUTE_POINTS } from "@/lib/intelligence/ranking/lead-priority";
import { applyGuessedEmailForLead } from "@/lib/services/guessed-email";
import { EVIDENCE_CONFIDENCE } from "@/lib/pipeline/stages/shared";
import { normalizeLinkedin } from "@/lib/text";

const log = createLogger("contact-route");
const MAX_CANDIDATES = 3;

async function searchProfileCandidates(
  person: PersonRow,
  company: CompanyRow,
): Promise<{ expected: { fullName: string; companyAliases: string[] }; candidates: ExaResult[]; searched: number }> {
  const companyAliases = companySearchAliases(company.name, { description: company.description, domain: company.domain });
  const expected = { fullName: person.fullName, companyAliases };
  const queries = [
    `${person.fullName} ${person.title ?? ""} ${company.name}`.trim(),
    `${person.fullName} ${company.name} linkedin`,
    `site:linkedin.com/in ${person.fullName} ${company.name}`,
  ];
  const stem = company.domain?.split(".")[0];
  if (stem && stem.length >= 2) queries.push(`site:linkedin.com/in ${person.fullName} ${stem}`);

  const seen = new Set<string>();
  const merged: ExaResult[] = [];
  const absorb = (rows: ExaResult[]) => {
    for (const r of dedupeByUrl(rows)) {
      const key = r.url.replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(r);
    }
  };
  for (const query of queries) {
    const { results } = await exaSearch({ query, category: "people", numResults: 8, maxCharacters: 3_000 });
    absorb(results);
  }
  const { results: linkedinOnly } = await exaSearch({
    query: person.fullName,
    includeDomains: ["linkedin.com"],
    numResults: 10,
    maxCharacters: 3_000,
  });
  absorb(linkedinOnly);

  const candidates = merged
    .filter((r) => isLinkedinProfileUrl(r.url) && (r.text?.length ?? 0) > 200)
    .filter((r) => worthReading({ expected, title: r.title, pageText: r.text ?? "" }))
    .slice(0, MAX_CANDIDATES);
  return { expected, candidates, searched: merged.filter((r) => isLinkedinProfileUrl(r.url)).length };
}

export type ContactRouteResult =
  | { status: "found"; linkedinUrl: string; checked: number }
  | { status: "already_has"; linkedinUrl: string | null; email: boolean }
  | { status: "not_found"; checked: number; reasons: string[] }
  | { status: "no_company" };

/**
 * Public-web contact route for a lead's person (used when no paid people-data provider is
 * available). Finds a candidate profile, then accepts it only if deterministic checks pass:
 * the extracted role must be quoted verbatim on the page, the name must match, and the current
 * employer must match the lead's company. Pattern email guesses run separately when domain is known.
 */
export async function resolveContactRoute(leadId: string): Promise<ContactRouteResult | null> {
  const lead = await getLeadRow(leadId);
  if (!lead) return null;
  const person = await getPerson(lead.personId);
  if (!person) return null;
  if (person.linkedinUrl || (person.email && isVerifiedEmailStatus(person.emailStatus))) {
    return { status: "already_has", linkedinUrl: person.linkedinUrl, email: Boolean(person.email) };
  }

  const company = lead.companyId ? await getCompany(lead.companyId) : null;
  if (!company) return { status: "no_company" };

  const { expected, candidates, searched } = await searchProfileCandidates(person, company);

  const reasons: string[] = [];
  if (candidates.length === 0) reasons.push("no profile matched both the name and the employer");

  for (const r of candidates) {
    const text = r.text ?? "";

    // 1) Deterministic: the headline, or a current role in the experience section, names the employer (no LLM).
    // 2) Fallback: the model extracts the role, but its quote must be verbatim AND name the employer.
    let statement: string;
    const byHeadline = verifyByHeadline({ expected, pageText: text, pageTitle: r.title });
    const byExperience = byHeadline.ok ? null : verifyByExperience({ expected, pageText: text, pageTitle: r.title });
    if (byHeadline.ok) {
      statement = `headline states "${byHeadline.headline}"`;
    } else if (byExperience?.ok) {
      statement = `experience section lists "${byExperience.statement}"`;
    } else {
      try {
        const role = await extractProfileRole({ url: r.url, text });
        const verdict = verifyProfile({ expected, role, pageText: text, pageTitle: r.title });
        if (!verdict.ok) {
          reasons.push(verdict.reason);
          continue;
        }
        statement = `current role "${role.quote}"`;
      } catch (e) {
        log.warn("profile read failed", { leadId, error: e instanceof Error ? e.message.slice(0, 120) : "unknown" });
        reasons.push(byHeadline.reason === "headline does not name the employer" ? "profile could not be read (try again shortly)" : byHeadline.reason);
        continue;
      }
    }
    const linkedinUrl = normalizeLinkedin(r.url);
    if (!linkedinUrl) continue;

    const saved = await upsertPerson({ fullName: person.fullName, companyId: company.id, linkedinUrl });
    if (saved.linkedinUrl !== linkedinUrl) {
      reasons.push("profile already attached to another person");
      continue;
    }

    // Attach to every lead for this person so the evidence is visible wherever they appear.
    const leadRows = await getDb().select({ id: eventLeads.id }).from(eventLeads).where(eq(eventLeads.personId, person.id));
    for (const l of leadRows) {
      await addEvidence({
        eventLeadId: l.id,
        sourceType: "public_web",
        sourceUrl: r.url,
        sourceTitle: r.title,
        evidenceText: `Public profile snapshot ${statement}. Self-published; not independently verified. Used as the outreach route because no verified work email is available.`,
        confidence: EVIDENCE_CONFIDENCE.public_web + 15,
      });
    }
    // Mirror the scoring-stage rule once, at the moment the route first exists.
    await getDb()
      .update(eventLeads)
      .set({ priorityScore: sql`least(100, ${eventLeads.priorityScore} + ${PROFILE_ROUTE_POINTS})` })
      .where(eq(eventLeads.personId, person.id));
    await updateAccountIntelligence(company.id); // contactability feeds account priority
    log.info("contact route found", { leadId, checked: candidates.length });
    return { status: "found", linkedinUrl, checked: searched };
  }

  await applyGuessedEmailForLead(leadId);
  log.info("contact route not found", { leadId, checked: searched });
  return { status: "not_found", checked: searched, reasons: [...new Set(reasons)].slice(0, 4) };
}
