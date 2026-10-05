import "server-only";
import type { SignalAdapter } from "../types";
import { attachDedupe } from "../normalize";
import { isMarketingContent, tieredConfidence, withoutVerificationPayload } from "../verify";
import { searchSignalCandidates, verifyNearCompany } from "./exa-shared";

const NEEDLES = /\b(new (plant|facility|warehouse|distribution (center|centre)|manufacturing (plant|facility|site))|(opens|opened|opening|breaks ground|groundbreaking)[^.]{0,60}(plant|facility|warehouse|distribution|logistics|factory|site)|capacity expansion|expands? (its )?(manufacturing|production|operations|footprint))\b/i;

/** Expansion implies *possible* growth in supplier/order/logistics complexity — a hypothesis, never a stated fact. */
export const expansionSignalAdapter: SignalAdapter = {
  id: "expansion",

  async discover(input) {
    const q = `"${input.companyName}" ("new facility" OR "distribution center" OR "manufacturing plant" OR expansion OR warehouse)`;
    return searchSignalCandidates(input, q, {
      type: "expansion",
      relevance: 55,
      urgency: 50,
      workflowHints: ["inbound_logistics", "purchase_order_creation", "supplier_communication"],
    });
  },

  async verify(candidate, input) {
    if (isMarketingContent(candidate.title)) return null;
    if (!candidate.occurredAt) return null;
    if (!verifyNearCompany(candidate, [NEEDLES], input.companyName)) return null;
    return attachDedupe(input.companyId, { ...withoutVerificationPayload(candidate), confidence: tieredConfidence(candidate, 72) });
  },
};
