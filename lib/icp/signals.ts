import type { OperationalSignal } from "./types";

export const COMPLEXITY_KEYWORDS = [
  "supply chain",
  "procurement",
  "purchasing",
  "warehouse",
  "distribution",
  "logistics",
  "manufacturing",
  "order management",
  "order processing",
  "inventory",
  "edi",
  "fulfillment",
  "3pl",
  "global operations",
  "multi-site",
  "suppliers",
  "shared services",
  "accounts payable",
  "accounts receivable",
] as const;

export const ERP_TECHNOLOGIES = [
  "sap",
  "oracle",
  "netsuite",
  "microsoft dynamics",
  "dynamics 365",
  "infor",
  "epicor",
  "sage",
  "ifs",
  "qad",
  "coupa",
  "ariba",
  "uipath",
  "celonis",
  "servicenow",
] as const;

export const AUTOMATION_CONTEXT_KEYWORDS = ["rpa", "uipath", "automation anywhere", "celonis", "servicenow", "coupa", "ariba"] as const;

export function detectOperationalSignals(text: string): OperationalSignal[] {
  const t = text.toLowerCase();
  const out = new Set<OperationalSignal>();
  if (/\bsap\b/.test(t)) out.add("sap");
  if (COMPLEXITY_KEYWORDS.some((k) => t.includes(k))) out.add("procurement_complexity");
  if (/order management|order processing|sales order/.test(t)) out.add("order_management_complexity");
  if (/global|international|multi-?country|worldwide/.test(t)) out.add("global_supply_chain");
  if (/document|invoice|pdf|email volume|paper/.test(t)) out.add("document_heavy");
  if (/manual|spreadsheet|excel|copy.?paste/.test(t)) out.add("manual_workflows");
  if (/shared services|ssc\b|global business services/.test(t)) out.add("shared_services");
  if (/(erp|enterprise resource)/.test(t)) out.add("erp_complexity");
  if (/supplier|vendor network|thousands of suppliers/.test(t)) out.add("high_supplier_count");
  return [...out];
}
