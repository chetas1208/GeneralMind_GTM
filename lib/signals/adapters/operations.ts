import "server-only";
import type { SignalAdapter } from "../types";
import { attachDedupe } from "../normalize";
import { isMarketingContent, tieredConfidence, withoutVerificationPayload } from "../verify";
import { searchSignalCandidates, verifyNearCompany } from "./exa-shared";

const NEEDLES = /\b(procurement transformation|supply chain transformation|order management transformation|finance transformation|shared services (transformation|centre|center)|operational excellence (program|initiative)|digital operations|automation (initiative|program))\b/i;
const ACTOR = /\b(announc\w+|launch\w+|kick\w* off|embark\w+|implement\w+|undertak\w+|roll\w* out|started|began|is investing|invests)\b/i;
const NEGATIVE = /\b(touchless (invoice|processing|AP)|fully automated (AP|invoice|order)|straight-through processing|\d{2}% (touchless|automated))\b/i;

export const operationalInitiativeAdapter: SignalAdapter = {
  id: "operations",

  async discover(input) {
    const q = `"${input.companyName}" ("procurement transformation" OR "supply chain transformation" OR "operational excellence" OR "finance transformation")`;
    const positive = await searchSignalCandidates(input, q, {
      type: "operational_initiative",
      relevance: 92,
      urgency: 70,
      workflowHints: ["purchase_order_creation", "accounts_payable", "supplier_communication"],
    });
    const negQ = `"${input.companyName}" ("touchless invoice" OR "fully automated AP" OR "straight-through processing")`;
    const negative = await searchSignalCandidates(input, negQ, {
      type: "automation_initiative",
      relevance: 40,
      urgency: 20,
      workflowHints: [],
    }).then((rows) =>
      rows.map((r) => ({ ...r, direction: "negative" as const, type: "technology_adoption" as const, summary: `Possible existing automation: ${r.summary.slice(0, 200)}` })),
    );
    return [...positive, ...negative];
  },

  async verify(candidate, input) {
    if (candidate.direction === "negative") {
      if (!verifyNearCompany(candidate, [NEGATIVE], input.companyName)) return null;
      return attachDedupe(input.companyId, { ...withoutVerificationPayload(candidate), confidence: 70, relevance: 35 });
    }
    if (isMarketingContent(candidate.title)) return null;
    if (!verifyNearCompany(candidate, [NEEDLES], input.companyName)) return null;
    // The company must be the actor (announces / launches / implements…), not a publisher writing thought leadership.
    if (!verifyNearCompany(candidate, [ACTOR], input.companyName, 200)) return null;
    return attachDedupe(input.companyId, { ...withoutVerificationPayload(candidate), confidence: tieredConfidence(candidate, 80) });
  },
};
