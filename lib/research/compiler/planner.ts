import type { ResearchTarget, ResearchPlan, PlannedQuery } from "./types";
import { generateOrthogonalQueries } from "./query-generator";
import { dedupePlannedQueries } from "./query-deduper";
import { chatWithRole } from "@/lib/ai/router";
import { isConfigured } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger("research-planner");

export async function compileResearchPlan(target: ResearchTarget): Promise<ResearchPlan> {
  const workflow = target.workflowHypotheses[0] ?? "p2p";
  const defaultQueries = generateOrthogonalQueries(target, workflow);

  // Filter out queries for facts that are already confirmed
  const confirmedSlots = new Set(
    target.knownFacts
      .filter((f) => f.confidenceBand === "confirmed" || f.confidenceBand === "strong")
      .map((f) => f.slotKey),
  );

  let planned = defaultQueries.filter((q) => {
    // Keep disconfirmation lane always
    if (q.lane === "disconfirmation") return true;
    return q.resolves.some((slot) => !confirmedSlots.has(slot));
  });

  planned = dedupePlannedQueries(planned);

  // If NVIDIA_API_KEY is configured, use 1 planning call to refine the search portfolio
  if (isConfigured("NVIDIA_API_KEY") && target.budget.maxLLMCalls > 0) {
    try {
      const prompt = `You are a GTM Search Compiler for enterprise B2B sales (GeneralMind).
Target: ${target.name} (${target.domain ?? "domain unknown"})
Workflow focus: ${workflow}
Known facts: ${target.knownFacts.map((f) => `${f.slotKey}: ${f.claim}`).join("; ") || "None"}

Refine this search portfolio of queries to cover remaining uncertainty without redundant terms:
${JSON.stringify(planned, null, 2)}

Respond with JSON:
{
  "queries": [
    {
      "id": "q-1",
      "lane": "persona",
      "query": "exact search term",
      "expectedInformationGain": 0.8,
      "estimatedCost": 0.05,
      "priority": 5,
      "resolves": ["personas.operational_buyer"],
      "independentOf": []
    }
  ],
  "objectives": ["Find procurement leader", "Confirm ERP system"]
}`;

      const res = await chatWithRole("PLANNER", {
        system: "You are an expert GTM research planner. Output only valid JSON with refined queries.",
        user: prompt,
        json: true,
        maxTokens: 1_200,
        temperature: 0.1,
      });

      const parsed = JSON.parse(res.text) as { queries?: PlannedQuery[]; objectives?: string[] };
      if (Array.isArray(parsed.queries) && parsed.queries.length > 0) {
        log.info("planner: LLM plan compiled successfully", { queries: parsed.queries.length });
        return {
          targetId: target.targetId,
          queries: dedupePlannedQueries(parsed.queries),
          objectives: (parsed.objectives ?? []).map((o, i) => ({
            id: `obj-${i + 1}`,
            description: o,
            lane: "workflow",
            priority: 4,
          })),
          stopConditions: [
            { type: "coverage_reached", threshold: 75, description: "Decision-weighted coverage >= 75%" },
            { type: "critical_disconfirmed", threshold: 1, description: "Target disconfirmed by negative evidence" },
            { type: "utility_collapsed", threshold: 4.0, description: "Remaining search utility < 4.0" },
            { type: "budget_exhausted", threshold: 0, description: "Search budget reached" },
          ],
        };
      }
    } catch (e) {
      log.warn("planner: falling back to deterministic plan", { error: e instanceof Error ? e.message : String(e) });
    }
  }

  return {
    targetId: target.targetId,
    queries: planned,
    objectives: [
      { id: "obj-1", description: "Identify operational decision-maker and workflow owner", lane: "persona", priority: 5 },
      { id: "obj-2", description: "Verify active modernization or event presence", lane: "intent", priority: 5 },
      { id: "obj-3", description: "Confirm ERP/AP stack complexity", lane: "technology", priority: 4 },
      { id: "obj-4", description: "Check negative hypothesis for existing automation", lane: "disconfirmation", priority: 5 },
    ],
    stopConditions: [
      { type: "coverage_reached", threshold: 75, description: "Decision-weighted coverage >= 75%" },
      { type: "critical_disconfirmed", threshold: 1, description: "Target disconfirmed by negative evidence" },
      { type: "utility_collapsed", threshold: 4.0, description: "Remaining search utility < 4.0" },
      { type: "budget_exhausted", threshold: 0, description: "Search budget reached" },
    ],
  };
}
