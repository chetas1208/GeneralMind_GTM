import "server-only";
import { mapSettled } from "@/lib/concurrency";
import { getCompany, listEventCompanies, updateCompany, upsertCompany, type CompanyRow } from "@/lib/db/queries/companies";
import type { EventRow } from "@/lib/db/queries/events";
import { isConfigured } from "@/lib/env";
import { enrichOrganizationByDomain } from "@/lib/integrations/apollo/organizations";
import { exaSearch } from "@/lib/integrations/exa/search";
import { COMPANY_PRESCORE_ENRICH_MIN, COMPANY_QUALIFY_MIN } from "@/lib/icp/config";
import { detectErpSignals, prescoreCompanyPublic, scoreCompany } from "@/lib/scoring/company-score";
import { detectOperationalSignals } from "@/lib/icp/signals";
import { getIntelligenceBudget } from "@/lib/intelligence/budget";
import { normalizeCompanyName, normalizeDomain, sanitizeText } from "@/lib/text";
import type { RunContext } from "../context";
import { namesMatch } from "./shared";

const PER_STEP = 4;
const REFRESH_AFTER_MS = 30 * 24 * 3600 * 1000;

const ASSOC_PRIORITY: Record<string, number> = { speaker_company: 0, exhibitor: 1, sponsor: 2, organizer: 3, partner: 4, public_attendance: 5, unknown: 6 };

/** Accept a candidate domain only when its label plausibly belongs to the company. */
function domainPlausible(name: string, domain: string): boolean {
  const label = domain.split(".")[0].replace(/[^a-z0-9]/g, "");
  const compact = normalizeCompanyName(name).replace(/[^a-z0-9]/g, "");
  if (label.length < 3 || compact.length < 3) return false;
  return label.includes(compact) || compact.includes(label);
}

async function resolveDomain(company: CompanyRow): Promise<string | null> {
  if (company.domain) return company.domain;
  const { results } = await exaSearch({ query: `${company.name} official website`, category: "company", numResults: 4, maxCharacters: 300 });
  for (const r of results) {
    const d = normalizeDomain(r.url);
    if (d && domainPlausible(company.name, d)) return d;
  }
  return null;
}

/** Stage C: resolve + enrich promising companies (bounded) and compute deterministic company fit. */
export async function runCompaniesStage(ctx: RunContext, event: EventRow): Promise<boolean> {
  ctx.setStage("qualifying");
  const c = ctx.cursor;

  if (!c.companyQueue) {
    const budget = getIntelligenceBudget();
    const linked = await listEventCompanies(event.id);
    const stale = Date.now() - REFRESH_AFTER_MS;
    const rows = await Promise.all(linked.map(async (l) => ({ l, row: await getCompany(l.companyId) })));
    const queue = rows
      .filter(({ l, row }) => {
        if (!row) return false;
        const assoc = [...l.associations].sort((a, b) => ASSOC_PRIORITY[a.type] - ASSOC_PRIORITY[b.type])[0];
        const pre = prescoreCompanyPublic({
          name: row.name,
          industry: row.industry,
          description: row.description,
          eventAssociation: assoc?.type === "speaker_company" ? "speaker_company" : assoc?.type === "exhibitor" ? "exhibitor" : assoc?.type === "sponsor" ? "sponsor" : assoc?.type === "partner" ? "partner" : "unknown",
        });
        return pre >= COMPANY_PRESCORE_ENRICH_MIN && (!row.enrichedAt || row.enrichedAt.getTime() < stale);
      })
      .sort((a, b) => Math.min(...a.l.associations.map((x) => ASSOC_PRIORITY[x.type] ?? 9)) - Math.min(...b.l.associations.map((x) => ASSOC_PRIORITY[x.type] ?? 9)))
      .slice(0, budget.maxCompaniesPerEvent)
      .map(({ l }) => l.companyId);
    c.companyQueue = queue;
    c.companiesDone = 0;
    ctx.counts.companiesFound = linked.length;
    ctx.note(`${linked.length} companies linked · ${queue.length} passed public pre-score (≥${COMPANY_PRESCORE_ENRICH_MIN}/20) for enrichment`);
  }

  const queue = c.companyQueue ?? [];
  const start = c.companiesDone ?? 0;
  const batch = queue.slice(start, start + PER_STEP);

  const outcomes = await mapSettled(batch, 2, async (id) => {
    const company = await getCompany(id);
    if (!company) return null;
    const domain = await resolveDomain(company);
    if (!domain) {
      await updateCompany(id, { enrichedAt: new Date(), enrichmentError: "Could not resolve a confident website domain" });
      return `${company.name}: domain unresolved`;
    }
    if (!isConfigured("APOLLO_API_KEY")) {
      await upsertCompany({ name: company.name, domain });
      return `${company.name}: domain ${domain} (Apollo not configured)`;
    }
    const org = await enrichOrganizationByDomain(domain);
    if (!org || !namesMatch(org.name, company.name)) {
      await upsertCompany({ name: company.name, domain });
      await updateCompany(id, { enrichedAt: new Date(), enrichmentError: org ? `Apollo match "${org.name}" did not agree with "${company.name}"` : "No Apollo organization match" });
      return `${company.name}: no confident Apollo match`;
    }
    const technologies = org.technology_names ?? org.current_technologies?.map((t) => t.name) ?? [];
    const description = sanitizeText(org.short_description);
    const erp = detectErpSignals(technologies);
    const ops = detectOperationalSignals(`${description} ${(org.keywords ?? []).join(" ")}`);
    const updated = await upsertCompany({
      name: company.name,
      domain: normalizeDomain(org.primary_domain ?? domain),
      websiteUrl: org.website_url,
      linkedinUrl: org.linkedin_url,
      apolloId: org.id,
      industry: org.industry,
      employeeCount: org.estimated_num_employees,
      estimatedRevenue: org.annual_revenue ?? org.organization_revenue,
      headquarters: [org.city, org.state, org.country].filter(Boolean).join(", ") || null,
      country: org.country,
      description,
      erpSignals: erp,
      operationalSignals: ops,
    });
    const fit = scoreCompany({
      industry: updated.industry,
      description: updated.description,
      keywords: org.keywords ?? [],
      employeeCount: updated.employeeCount,
      country: updated.country,
      technologies,
    });
    await updateCompany(updated.id, { companyFitScore: fit.total, enrichedAt: new Date(), enrichmentError: null });
    ctx.counters.companiesEnriched = (ctx.counters.companiesEnriched ?? 0) + 1;
    ctx.counters.apolloCalls = (ctx.counters.apolloCalls ?? 0) + 1;
    return `${updated.name}: ${updated.industry ?? "industry n/a"}, ${updated.employeeCount?.toLocaleString("en-US") ?? "?"} employees → company fit ${fit.total}/40`;
  });

  outcomes.forEach((o, i) => {
    if (!o.ok) ctx.note(`Enrichment failed for company ${batch[i].slice(0, 8)}: ${o.error instanceof Error ? o.error.message.slice(0, 180) : String(o.error)}`, "warn");
    else if (o.value) ctx.note(o.value);
  });
  c.companiesDone = start + batch.length;

  if ((c.companiesDone ?? 0) < queue.length) return false;

  // Stage complete → decide which companies pass the ICP filter.
  const linked = await listEventCompanies(event.id);
  c.qualifiedCompanyIds = linked.filter((l) => (l.companyFitScore ?? 0) >= COMPANY_QUALIFY_MIN).map((l) => l.companyId);
  ctx.counters.companiesQualified = c.qualifiedCompanyIds.length;
  ctx.note(`${c.qualifiedCompanyIds.length} of ${linked.length} companies passed account fit (≥ ${COMPANY_QUALIFY_MIN}/40)`);
  return true;
}
