import type { Persona, PersonaFamily, Seniority } from "./types";

export const FUNCTION_POINTS: Record<Persona, number> = {
  procurement: 12,
  supply_chain: 12,
  order_management: 12,
  operations_leadership: 11,
  finance_operations: 10,
  it_erp: 9,
  digital_transformation: 8,
  executive_other: 4,
  other: 0,
};

export const SENIORITY_POINTS: Record<Seniority, number> = {
  c_suite: 8,
  vp: 7,
  head: 7,
  director: 5,
  manager: 3,
  individual: 1,
  unknown: 0,
};

/** Workflow proximity bonus cap (persona fit). */
export const WORKFLOW_PROXIMITY_MAX = 7;
export const DECISION_INFLUENCE_MAX = 3;

export const PERSONA_FAMILY: Record<Persona, PersonaFamily> = {
  operations_leadership: "executive_operations",
  procurement: "procurement",
  supply_chain: "supply_chain",
  order_management: "order_management",
  finance_operations: "finance_operations",
  it_erp: "enterprise_technology",
  digital_transformation: "enterprise_technology",
  executive_other: "executive_operations",
  other: "other",
};

type PersonaRule = { persona: Persona; pattern: RegExp };

export const PERSONA_RULES: PersonaRule[] = [
  { persona: "supply_chain", pattern: /supply chain|logistic|demand planning|s&op|warehouse|fulfil+ment|distribution/ },
  { persona: "procurement", pattern: /procure|purchasing|strategic sourcing|category management|vendor management|supplier/ },
  { persona: "order_management", pattern: /order management|order to cash|o2c|customer operations|order fulfil+ment|order processing/ },
  {
    persona: "finance_operations",
    pattern: /accounts payable|\bap\b|accounts receivable|finance operations|shared services|record to report|\bfp&a\b|treasur/,
  },
  { persona: "it_erp", pattern: /\berp\b|\bsap\b|enterprise (applications|systems)|\bcio\b|business systems|applications director/ },
  { persona: "digital_transformation", pattern: /digital transformation|process improvement|operational excellence|intelligent automation/ },
  { persona: "operations_leadership", pattern: /operations|operating|\bcoo\b|manufacturing|plant|production|general manager/ },
  { persona: "executive_other", pattern: /\bceo\b|president|founder|\bcfo\b|chief [a-z ]+ officer/ },
];

type SeniorityRule = { seniority: Seniority; pattern: RegExp };
export const SENIORITY_RULES: SeniorityRule[] = [
  { seniority: "c_suite", pattern: /\bchief\b|\bc[a-z]{1,2}o\b|\bceo\b|\bcoo\b|\bcio\b|\bcfo\b|\bcto\b|\bcpo\b|\bcsco\b|\bpresident\b|\bfounder\b/ },
  { seniority: "vp", pattern: /\bvice president\b|\bvp\b|\bsvp\b|\bevp\b/ },
  { seniority: "head", pattern: /\bhead of\b|\bglobal head\b/ },
  { seniority: "director", pattern: /\bdirector\b/ },
  { seniority: "manager", pattern: /\bmanager\b|\blead\b/ },
  { seniority: "individual", pattern: /\banalyst\b|\bspecialist\b|\bcoordinator\b|\bengineer\b/ },
];

const norm = (t: string) => t.toLowerCase().replace(/[,/|()–—-]/g, " ").replace(/\s+/g, " ").trim();

export function classifyTitle(title: string | null | undefined): {
  persona: Persona;
  seniority: Seniority;
  inconclusive: boolean;
} {
  if (!title) return { persona: "other", seniority: "unknown", inconclusive: true };
  const t = norm(title);
  const persona = PERSONA_RULES.find((r) => r.pattern.test(t))?.persona;
  const seniority = SENIORITY_RULES.find((r) => r.pattern.test(t))?.seniority ?? "unknown";
  return { persona: persona ?? "other", seniority, inconclusive: !persona };
}

export function workflowProximityPoints(persona: Persona): number {
  if (persona === "procurement" || persona === "order_management" || persona === "finance_operations") return 7;
  if (persona === "supply_chain" || persona === "operations_leadership") return 6;
  if (persona === "it_erp" || persona === "digital_transformation") return 4;
  return 0;
}

export function decisionInfluencePoints(seniority: Seniority): number {
  if (seniority === "c_suite" || seniority === "vp") return 3;
  if (seniority === "head" || seniority === "director") return 2;
  return 0;
}
