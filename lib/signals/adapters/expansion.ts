import "server-only";
import type { SignalAdapter } from "../types";
import { attachDedupe } from "../normalize";
import { searchSignalCandidates, verifySnippet } from "./exa-shared";

const NEEDLES = /new (plant|facility|warehouse|distribution center|manufacturing)|expansion|opens|groundbreaking|capacity/i;

export const expansionSignalAdapter: SignalAdapter = {
  id: "expansion",

  async discover(input) {
    const q = `"${input.companyName}" ("new facility" OR "distribution center" OR "manufacturing plant" OR expansion OR warehouse)`;
    return searchSignalCandidates(input, q, {
      type: "expansion",
      relevance: 62,
      urgency: 55,
      workflowHints: ["inbound_logistics", "purchase_order_creation", "supplier_communication"],
    });
  },

  async verify(candidate, input) {
    if (!verifySnippet(candidate, [NEEDLES])) return null;
    return attachDedupe(input.companyId, { ...candidate, confidence: 74 });
  },
};
