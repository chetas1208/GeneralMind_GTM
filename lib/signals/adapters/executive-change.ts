import "server-only";
import type { SignalAdapter } from "../types";
import { attachDedupe } from "../normalize";
import { isMarketingContent, tieredConfidence, withoutVerificationPayload } from "../verify";
import { searchSignalCandidates, verifyNearCompany } from "./exa-shared";

const APPOINTMENT = /\b(appointed|appoints|names|named|joins as|has joined|promoted|new (chief|vp|vice president|head|svp))\b/i;
const ROLE = /\b(COO|CPO|CIO|CDO|Chief (Procurement|Supply Chain|Operating|Information|Digital) Officer|(VP|Vice President|SVP|Head) of (Procurement|Supply Chain|Operations|Shared Services|Finance Transformation|Digital Transformation))\b/i;

/** New functional leader ≠ confirmed buyer: stored as a timing signal only. */
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
    if (isMarketingContent(candidate.title)) return null;
    if (!candidate.occurredAt) return null; // the 90-day window is the whole point; undated moves can't be ranked
    // Both an appointment verb AND a target role must be stated about this company.
    if (!verifyNearCompany(candidate, [APPOINTMENT], input.companyName, 300)) return null;
    if (!verifyNearCompany(candidate, [ROLE], input.companyName, 300)) return null;
    return attachDedupe(input.companyId, { ...withoutVerificationPayload(candidate), confidence: tieredConfidence(candidate, 74) });
  },
};
