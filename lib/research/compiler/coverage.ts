import type { EvidenceBlackboard } from "../blackboard/blackboard";
import type { WorkflowType } from "./types";

export type CoverageAnalysis = {
  coveragePct: number; // 0 to 100
  totalWeightedScore: number;
  maxPossibleScore: number;
  resolvedSlots: string[];
  partialSlots: string[];
  missingSlots: string[];
  conflictedSlots: string[];
  isSufficient: boolean;
};

export function calculateCoverage(
  blackboard: EvidenceBlackboard,
  workflow: WorkflowType = "p2p",
): CoverageAnalysis {
  const allSlots = blackboard.getAllSlots();
  let totalScore = 0;
  let maxScore = 0;

  const resolvedSlots: string[] = [];
  const partialSlots: string[] = [];
  const missingSlots: string[] = [];
  const conflictedSlots: string[] = [];

  for (const slot of allSlots) {
    let weight = slot.weight;

    // Workflow-specific weight adjustments
    if (workflow === "p2p" || workflow === "ap_automation") {
      if (slot.key === "personas.operational_buyer" || slot.key === "technology.procurement_suite" || slot.key === "workflow.p2p_pain") {
        weight = Math.min(5, weight + 1);
      }
    } else if (workflow === "o2c" || workflow === "order_management") {
      if (slot.key === "workflow.o2c_pain" || slot.key === "technology.erp") {
        weight = Math.min(5, weight + 1);
      }
    }

    maxScore += weight;

    if (slot.state === "supported") {
      totalScore += weight;
      resolvedSlots.push(slot.key);
    } else if (slot.state === "partial") {
      totalScore += weight * 0.5;
      partialSlots.push(slot.key);
    } else if (slot.state === "conflicted") {
      totalScore += weight * 0.25;
      conflictedSlots.push(slot.key);
    } else if (slot.state === "unknown") {
      missingSlots.push(slot.key);
    }
  }

  const coveragePct = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const isSufficient = coveragePct >= 75 && resolvedSlots.includes("personas.operational_buyer");

  return {
    coveragePct,
    totalWeightedScore: totalScore,
    maxPossibleScore: maxScore,
    resolvedSlots,
    partialSlots,
    missingSlots,
    conflictedSlots,
    isSufficient,
  };
}
