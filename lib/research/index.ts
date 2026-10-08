import { executeCompilerResearch, type CompilerResearchOutput } from "./compiler/engine";
import type { ResearchTarget } from "./compiler/types";

export * from "./compiler/types";
export * from "./compiler/engine";
export * from "./compiler/budget";
export * from "./compiler/coverage";
export * from "./compiler/frontier";
export * from "./compiler/governor";
export * from "./compiler/ledger";
export * from "./compiler/stop-policy";
export * from "./compiler/query-deduper";
export * from "./compiler/query-generator";
export * from "./compiler/planner";
export * from "./blackboard/blackboard";
export * from "./blackboard/types";
export * from "./cache/query-cache";
export * from "./cache/entity-cache";
export * from "./cache/source-cache";

export async function executeResearch(target: ResearchTarget): Promise<CompilerResearchOutput> {
  const engine = process.env.RESEARCH_ENGINE || "compiler";
  if (engine === "legacy") {
    // Legacy fallback wrapper
    return executeCompilerResearch({
      ...target,
      budget: {
        ...target.budget,
        maxSearchCalls: 4,
        maxLLMCalls: 1,
      },
    });
  }

  return executeCompilerResearch(target);
}
