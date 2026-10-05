import { classifyIndustryTier, industryTierPoints } from "./industries";
import { COMPLEXITY_KEYWORDS, detectOperationalSignals, ERP_TECHNOLOGIES } from "./signals";
import { GEO, MAX } from "./config";
import type { ScoreFactor, ScoreSection } from "./types";

export type CompanyScoreInput = {
  industry?: string | null;
  description?: string | null;
  keywords?: string[];
  employeeCount?: number | null;
  country?: string | null;
  technologies?: string[];
  /** Event context: exhibitor/sponsor boosts pre-score when firmographics unknown. */
  eventAssociation?: "speaker_company" | "exhibitor" | "sponsor" | "partner" | "unknown";
};

const lower = (s: string | null | undefined) => (s ?? "").toLowerCase();

export function detectErpSignals(technologies: string[] = []): string[] {
  const found = new Set<string>();
  for (const tech of technologies) {
    const t = tech.toLowerCase();
    for (const erp of ERP_TECHNOLOGIES) {
      const re = new RegExp(`(^|[^a-z])${erp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`);
      if (re.test(t)) found.add(tech);
    }
  }
  return [...found];
}

/** Full company fit 0–40 (post-enrichment). */
export function scoreCompanyFit(input: CompanyScoreInput): ScoreSection {
  const industry = lower(input.industry);
  const corpus = [industry, lower(input.description), (input.keywords ?? []).join(" ").toLowerCase()].join(" ").trim();
  const factors: ScoreFactor[] = [];

  const tier = classifyIndustryTier(corpus || industry);
  const industryPts = industryTierPoints(tier);
  factors.push({
    key: "industry",
    label: "Industry",
    points: industryPts,
    max: 10,
    note: tier === "A" ? "Core industrial / distribution vertical" : tier === "B" ? "Adjacent vertical" : "Outside core verticals",
  });

  const n = input.employeeCount ?? null;
  let sizePts = 0;
  let sizeNote = "Scale unknown";
  if (n !== null) {
    if (n >= 500 && n <= 20_000) sizePts = 8;
    else if (n > 20_000 && n <= 100_000) sizePts = 7;
    else if (n > 100_000) sizePts = 5;
    else if (n >= 200) sizePts = 5;
    else if (n >= 50) sizePts = 2;
    sizeNote = `${n.toLocaleString("en-US")} employees`;
  } else if (input.eventAssociation === "exhibitor" || input.eventAssociation === "sponsor") {
    sizePts = 3;
    sizeNote = "Enterprise event participant (scale not yet enriched)";
  }
  factors.push({ key: "scale", label: "Company scale", points: sizePts, max: 8, note: sizeNote });

  const opsSignals = detectOperationalSignals(corpus);
  const opsPts = Math.min(8, opsSignals.length * 2);
  factors.push({
    key: "complexity",
    label: "Operational complexity",
    points: opsPts,
    max: 8,
    note: opsSignals.length ? opsSignals.slice(0, 4).join(", ") : "No complexity signals",
  });

  const workflowHits = COMPLEXITY_KEYWORDS.filter((k) => corpus.includes(k));
  const workflowPts = Math.min(8, workflowHits.length >= 3 ? 8 : workflowHits.length * 2);
  factors.push({
    key: "workflow",
    label: "Workflow alignment",
    points: workflowPts,
    max: 8,
    note: workflowHits.length ? workflowHits.slice(0, 4).join(", ") : "No workflow keywords",
  });

  const erp = detectErpSignals(input.technologies);
  const erpPts = erp.length >= 2 ? 4 : erp.length === 1 ? 3 : /\bsap\b/.test(corpus) ? 2 : 0;
  factors.push({
    key: "erp",
    label: "ERP / digital signals",
    points: erpPts,
    max: 4,
    note: erp.length ? erp.slice(0, 3).join(", ") : "No ERP detected",
  });

  const country = lower(input.country);
  let geoPts = 0;
  let geoNote = "Geography unknown";
  if (country) {
    if (GEO.primary.some((g) => country === g || country.includes(g))) {
      geoPts = 2;
      geoNote = `${input.country} (primary market)`;
    } else if (GEO.secondary.some((g) => country.includes(g))) {
      geoPts = 1;
      geoNote = `${input.country} (secondary market)`;
    }
  }
  factors.push({ key: "geo", label: "Geographic relevance", points: geoPts, max: 2, note: geoNote });

  const total = Math.min(MAX.company, factors.reduce((a, f) => a + f.points, 0));
  return { total, max: MAX.company, factors };
}

/** Cheap pre-enrichment gate: 0–20 from name + event role + description snippets. */
export function prescoreCompanyPublic(input: {
  name: string;
  industry?: string | null;
  description?: string | null;
  eventAssociation?: CompanyScoreInput["eventAssociation"];
}): number {
  const corpus = `${input.name} ${input.industry ?? ""} ${input.description ?? ""}`.toLowerCase();
  let pts = industryTierPoints(classifyIndustryTier(corpus));
  if (input.eventAssociation === "speaker_company") pts += 6;
  else if (input.eventAssociation === "exhibitor") pts += 5;
  else if (input.eventAssociation === "sponsor") pts += 4;
  else if (input.eventAssociation === "partner") pts += 2;
  pts += Math.min(4, detectOperationalSignals(corpus).length);
  return Math.min(20, pts);
}
