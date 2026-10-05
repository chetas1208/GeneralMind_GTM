import "server-only";
import type { SignalAdapter } from "../types";
import { attachDedupe } from "../normalize";
import { searchSignalCandidates, verifySnippet } from "./exa-shared";

const NEEDLES = /procurement transformation|supply chain transformation|operational excellence|finance transformation|shared services|digital operations|automation initiative/i;
const NEGATIVE = /touchless|fully automated|95% automated|straight-through processing|no manual/i;

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
      if (!verifySnippet(candidate, [NEGATIVE])) return null;
      return attachDedupe(input.companyId, { ...candidate, confidence: 70, relevance: 35 });
    }
    if (!verifySnippet(candidate, [NEEDLES])) return null;
    return attachDedupe(input.companyId, { ...candidate, confidence: 82 });
  },
};
