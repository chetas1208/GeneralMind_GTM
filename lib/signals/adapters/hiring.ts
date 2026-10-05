import "server-only";
import type { SignalAdapter } from "../types";
import { attachDedupe } from "../normalize";
import { isMarketingContent, looksLikeSpecificRole, roleRelevance, tieredConfidence, withoutVerificationPayload } from "../verify";
import { searchSignalCandidates, verifyNearCompany } from "./exa-shared";

const FUNCTION_NEEDLES = /\b(procurement|strategic sourcing|supply chain|order management|accounts payable|accounts receivable|shared services|SAP|ERP|enterprise applications|finance transformation|operational excellence|automation)\b/i;

/** Hiring → a verified fact (a role is posted) that cautiously implies organisational investment in a function. */
export const hiringSignalAdapter: SignalAdapter = {
  id: "hiring",

  async discover(input) {
    const domain = input.domain ? ` site:${input.domain}` : "";
    const q = `"${input.companyName}" (hiring OR "job opening" OR careers) (procurement OR "supply chain" OR SAP OR "order management" OR "accounts payable")${domain}`;
    return searchSignalCandidates(input, q, {
      type: "hiring",
      relevance: 70,
      urgency: 65,
      workflowHints: ["purchase_order_creation", "accounts_payable", "sap_operations"],
    });
  },

  async verify(candidate, input) {
    if (isMarketingContent(candidate.title)) return null;
    // Careers landing pages ("Supply Chain Careers") are not postings.
    if (!looksLikeSpecificRole(candidate.title)) return null;
    if (!verifyNearCompany(candidate, [FUNCTION_NEEDLES], input.companyName, 2000)) return null;
    const relevance = roleRelevance(candidate.title);
    return attachDedupe(input.companyId, {
      ...withoutVerificationPayload(candidate),
      type: "job_posting",
      confidence: tieredConfidence(candidate, 76),
      relevance,
      metadata: {
        ...withoutVerificationPayload(candidate).metadata,
        semantics: { fact: `Role posted: ${candidate.title}`, inference: relevance >= 85 ? "Organisational investment in this function" : "Routine staffing; weak signal" },
      },
    });
  },
};
