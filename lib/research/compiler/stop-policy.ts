import type { CoverageAnalysis } from "./coverage";
import type { BudgetTracker } from "./budget";
import type { ResearchFrontier } from "./frontier";
import type { EvidenceBlackboard } from "../blackboard/blackboard";

export type StopDecision = {
  shouldStop: boolean;
  reason:
    | "coverage_satisfied"
    | "critical_disconfirmed"
    | "utility_collapsed"
    | "budget_exhausted"
    | "continue";
  explanation: string;
};

export function evaluateStopPolicy(opts: {
  coverage: CoverageAnalysis;
  frontier: ResearchFrontier;
  budget: BudgetTracker;
  blackboard: EvidenceBlackboard;
  targetCoveragePct?: number;
  utilityThreshold?: number;
}): StopDecision {
  const targetCoverage = opts.targetCoveragePct ?? 75;
  const utilityFloor = opts.utilityThreshold ?? 4.0;

  // 1. Critical disconfirmation found
  if (opts.blackboard.isCriticalDisconfirmed()) {
    return {
      shouldStop: true,
      reason: "critical_disconfirmed",
      explanation: "Disconfirmation lane found definitive evidence that this target is not viable (workflow already automated or contact departed).",
    };
  }

  // 2. Coverage goal satisfied
  if (opts.coverage.coveragePct >= targetCoverage && opts.coverage.isSufficient) {
    return {
      shouldStop: true,
      reason: "coverage_satisfied",
      explanation: `Knowledge coverage reached ${opts.coverage.coveragePct}%, satisfying decision requirements.`,
    };
  }

  // 3. Budget exhausted
  if (!opts.budget.canSearch() || opts.budget.isTimeExceeded()) {
    return {
      shouldStop: true,
      reason: "budget_exhausted",
      explanation: "Allocated search or time budget reached its ceiling.",
    };
  }

  // 4. Marginal utility collapsed
  const bestUtility = opts.frontier.getBestUtility();
  if (bestUtility < utilityFloor) {
    return {
      shouldStop: true,
      reason: "utility_collapsed",
      explanation: `Remaining search utility (${bestUtility}) is below threshold (${utilityFloor}). Marginal information gain does not justify additional search calls.`,
    };
  }

  return {
    shouldStop: false,
    reason: "continue",
    explanation: `Coverage is ${opts.coverage.coveragePct}%. Frontier has viable searches with utility up to ${bestUtility}.`,
  };
}
