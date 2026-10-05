import "server-only";
import type { SignalAdapter } from "../types";
import { attachDedupe } from "../normalize";
import { searchSignalCandidates, verifySnippet } from "./exa-shared";

const NEEDLES = /s\/4hana|sap migration|erp transformation|erp modernization|oracle fusion|dynamics 365|netsuite|erp consolidation/i;

export const erpSignalAdapter: SignalAdapter = {
  id: "erp",

  async discover(input) {
    const q = `"${input.companyName}" (SAP S/4HANA OR "ERP transformation" OR "ERP migration" OR "Oracle Fusion" OR "Dynamics 365")`;
    return searchSignalCandidates(input, q, {
      type: "erp_transformation",
      relevance: 88,
      urgency: 50,
      workflowHints: ["sap_operations", "erp_sync", "email_to_erp", "exception_management"],
    });
  },

  async verify(candidate, input) {
    if (!verifySnippet(candidate, [NEEDLES])) return null;
    const stage = /completed|go-live|live on/i.test(candidate.summary) ? "completed" : /underway|implement|migrat/i.test(candidate.summary) ? "underway" : "announced";
    return attachDedupe(input.companyId, {
      ...candidate,
      confidence: 80,
      metadata: { ...(candidate.metadata ?? {}), erpStage: stage },
    });
  },
};
