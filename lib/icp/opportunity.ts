import { WORKFLOW_KEYWORDS, workflowLabel } from "./workflows";
import type { OpportunityClassification, OpportunityHypothesis, Persona, WorkflowType } from "./types";

/** Deterministic workflow hypotheses from public signals — AI may refine later. */
export function inferOpportunityHypothesis(input: {
  persona: Persona | null;
  operationalSignals: string[];
  erpSignals: string[];
  description?: string | null;
  attendanceConfirmed: boolean;
}): OpportunityHypothesis {
  const corpus = `${input.description ?? ""} ${input.operationalSignals.join(" ")} ${input.erpSignals.join(" ")}`.toLowerCase();
  const workflows = new Set<WorkflowType>();
  const evidence: string[] = [];

  for (const [wf, keys] of Object.entries(WORKFLOW_KEYWORDS) as [WorkflowType, string[]][]) {
    if (keys.some((k) => corpus.includes(k))) {
      workflows.add(wf);
      evidence.push(`Public text mentions ${keys.find((k) => corpus.includes(k))}`);
    }
  }

  if (input.persona === "procurement") workflows.add("purchase_order_creation");
  if (input.persona === "finance_operations") workflows.add("accounts_payable");
  if (input.persona === "order_management") workflows.add("sales_order_creation");
  if (input.erpSignals.some((e) => /sap/i.test(e)) || /\bsap\b/.test(corpus)) workflows.add("sap_operations");

  const list = [...workflows].slice(0, 6);
  const classification: OpportunityClassification =
    evidence.length >= 2 ? "evidence_backed" : list.length ? "strong_inference" : "speculative";

  const rationale =
    list.length === 0
      ? "No specific workflow could be inferred from public signals — review company context manually."
      : `Likely GeneralMind-relevant workflows: ${list.map(workflowLabel).join(", ")}.`;

  return {
    workflows: list,
    confidence: classification === "evidence_backed" ? 0.75 : classification === "strong_inference" ? 0.55 : 0.3,
    evidence: evidence.slice(0, 5),
    rationale,
    classification,
    generatedAt: new Date().toISOString(),
  };
}
