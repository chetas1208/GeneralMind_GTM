import "server-only";
import type { SignalAdapter } from "../types";
import { attachDedupe } from "../normalize";
import { searchSignalCandidates, verifySnippet } from "./exa-shared";

const NEEDLES = /procurement|supply chain|order management|accounts payable|shared services|sap|erp|transformation|automation/i;

export const hiringSignalAdapter: SignalAdapter = {
  id: "hiring",

  async discover(input) {
    const domain = input.domain ? ` site:${input.domain}` : "";
    const q = `"${input.companyName}" (hiring OR "job opening" OR careers) (procurement OR "supply chain" OR SAP OR "order management" OR "accounts payable")${domain}`;
    return searchSignalCandidates(input, q, {
      type: "hiring",
      relevance: 82,
      urgency: 65,
      workflowHints: ["purchase_order_creation", "accounts_payable", "sap_operations"],
    });
  },

  async verify(candidate, input) {
    if (!verifySnippet(candidate, [NEEDLES])) return null;
    return attachDedupe(input.companyId, { ...candidate, type: "job_posting", confidence: 78 });
  },
};
