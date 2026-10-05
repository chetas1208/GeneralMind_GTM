import "server-only";
import type { SignalAdapter } from "../types";
import { attachDedupe } from "../normalize";
import { searchSignalCandidates, verifySnippet } from "./exa-shared";

const NEEDLES = /appointed|names|joins as|new (chief|vp|head)|chief procurement|chief supply chain|coo|cio/i;

export const executiveChangeSignalAdapter: SignalAdapter = {
  id: "executive",

  async discover(input) {
    const q = `"${input.companyName}" appointed OR "joins as" (COO OR CPO OR "Chief Procurement" OR "Chief Supply Chain" OR CIO OR "VP Procurement" OR "VP Supply Chain")`;
    return searchSignalCandidates(input, q, {
      type: "executive_change",
      relevance: 75,
      urgency: 80,
      workflowHints: ["purchase_order_creation", "exception_management"],
    });
  },

  async verify(candidate, input) {
    if (!verifySnippet(candidate, [NEEDLES])) return null;
    return attachDedupe(input.companyId, { ...candidate, confidence: 76 });
  },
};
