import "server-only";
import type { SignalAdapter } from "../types";
import { attachDedupe } from "../normalize";
import { isMarketingContent, tieredConfidence, withoutVerificationPayload } from "../verify";
import { searchSignalCandidates, verifyNearCompany } from "./exa-shared";

const PRODUCT = String.raw`(?:S\/4\s?HANA|SAP|Oracle Fusion|Dynamics 365|NetSuite|ERP)`;
const ACTION = String.raw`(?:migrat\w*|mov(?:e|es|ed|ing) to|implement\w*|roll(?:s|ed|ing)? out|rollout|go-live|went live|select(?:s|ed)|transition\w*|upgrad\w*|transform\w*|moderni[sz]\w*|consolidat\w*)`;
/** An ERP signal needs an ACTION on the company's own ERP — merely mentioning a product (e.g. a vendor integration) is not enough. */
const NEEDLES = new RegExp(`${ACTION}[^.]{0,80}${PRODUCT}|${PRODUCT}[^.]{0,60}${ACTION}`, "i");

/**
 * Stage matters commercially: an ERP programme that is *underway* is poorly timed for integration-layer automation
 * (interfaces may change); *completed* → optimisation phase; *announced* → planning window.
 */
export function classifyErpStage(text: string): "completed" | "underway" | "announced" {
  if (/\b(went live|go-live completed|successfully (migrated|implemented)|completed (the )?(migration|rollout|implementation)|now live on)\b/i.test(text)) return "completed";
  if (/\b(underway|in progress|currently (migrating|implementing)|phase \d|wave \d|rolling out|cutover)\b/i.test(text)) return "underway";
  return "announced";
}

export const erpSignalAdapter: SignalAdapter = {
  id: "erp",

  async discover(input) {
    const q = `"${input.companyName}" (SAP S/4HANA OR "ERP transformation" OR "ERP migration" OR "Oracle Fusion" OR "Dynamics 365")`;
    return searchSignalCandidates(input, q, {
      type: "erp_transformation",
      relevance: 85,
      urgency: 50,
      workflowHints: ["sap_operations", "erp_sync", "email_to_erp", "exception_management"],
    });
  },

  async verify(candidate, input) {
    if (isMarketingContent(candidate.title)) return null;
    if (!candidate.occurredAt) return null; // stage-sensitive: an undated ERP claim cannot be aged
    if (!verifyNearCompany(candidate, [NEEDLES], input.companyName)) return null;
    const text = String(candidate.metadata?.fullTextForVerification ?? candidate.summary);
    const stage = classifyErpStage(text);
    const clean = withoutVerificationPayload(candidate);
    return attachDedupe(input.companyId, {
      ...clean,
      confidence: tieredConfidence(candidate, 78),
      // Underway migrations are a timing caution for interface-level automation, not a green light.
      relevance: stage === "underway" ? 62 : stage === "completed" ? 80 : 85,
      urgency: stage === "underway" ? 35 : 55,
      metadata: { ...(clean.metadata ?? {}), erpStage: stage },
    });
  },
};
