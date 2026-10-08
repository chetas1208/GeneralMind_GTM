import type { KnowledgeGap, SearchUtilityItem, ResearchLane } from "./types";
import type { EvidenceBlackboard } from "../blackboard/blackboard";

export function computeSearchUtility(item: {
  gap: KnowledgeGap;
  query: string;
  lane: ResearchLane;
  expectedInformationGain: number; // 0 to 1
  decisionImportance: number; // 1 to 5
  probabilityOfFindingEvidence: number; // 0 to 1
  estimatedCost: number; // in USD or normalized units, e.g. 0.05
}): SearchUtilityItem {
  const cost = Math.max(0.01, item.estimatedCost);
  const rawUtility =
    (item.expectedInformationGain * item.decisionImportance * item.probabilityOfFindingEvidence) / cost;
  const searchUtility = Math.round(rawUtility * 100) / 100;

  return {
    ...item,
    searchUtility,
  };
}

export class ResearchFrontier {
  private frontier: SearchUtilityItem[] = [];

  constructor(items: SearchUtilityItem[] = []) {
    this.frontier = [...items].sort((a, b) => b.searchUtility - a.searchUtility);
  }

  addItems(items: SearchUtilityItem[]): void {
    this.frontier.push(...items);
    this.frontier.sort((a, b) => b.searchUtility - a.searchUtility);
  }

  getTopActions(limit: number = 3): SearchUtilityItem[] {
    const selected: SearchUtilityItem[] = [];
    const usedLanes = new Set<ResearchLane>();

    for (const item of this.frontier) {
      if (selected.length >= limit) break;
      // Prefer orthogonal lanes where possible to ensure independent parallel branches
      if (!usedLanes.has(item.lane)) {
        selected.push(item);
        usedLanes.add(item.lane);
      }
    }

    // Fill remaining if needed
    for (const item of this.frontier) {
      if (selected.length >= limit) break;
      if (!selected.some((s) => s.query === item.query)) {
        selected.push(item);
      }
    }

    return selected;
  }

  getBestUtility(): number {
    return this.frontier[0]?.searchUtility ?? 0;
  }

  size(): number {
    return this.frontier.length;
  }
}

export function buildFrontierFromBlackboard(
  targetName: string,
  blackboard: EvidenceBlackboard,
): ResearchFrontier {
  const missingSlots = blackboard.getAllSlots().filter((s) => s.state === "unknown" || s.state === "conflicted");
  const items: SearchUtilityItem[] = [];

  for (const s of missingSlots) {
    let lane: ResearchLane = "workflow";
    let query = "";
    let gain = 0.7;
    let prob = 0.6;

    if (s.key.startsWith("personas.")) {
      lane = "persona";
      query = `"${targetName}" VP Procurement OR Chief Procurement Officer OR VP Supply Chain`;
      gain = 0.9;
      prob = 0.7;
    } else if (s.key.startsWith("technology.")) {
      lane = "technology";
      query = `"${targetName}" SAP S/4HANA OR Oracle OR Coupa transformation`;
      gain = 0.8;
      prob = 0.65;
    } else if (s.key.startsWith("signals.")) {
      lane = "intent";
      query = `"${targetName}" procurement transformation OR supply chain expansion 2026`;
      gain = 0.75;
      prob = 0.6;
    } else if (s.key.startsWith("negative.")) {
      lane = "disconfirmation";
      query = `"${targetName}" touchless AP automation OR already automated EDI`;
      gain = 0.85;
      prob = 0.5;
    } else {
      query = `"${targetName}" ${s.label}`;
    }

    items.push(
      computeSearchUtility({
        gap: {
          slotKey: s.key,
          importance: s.weight,
          description: s.label,
          lane,
        },
        query,
        lane,
        expectedInformationGain: gain,
        decisionImportance: s.weight,
        probabilityOfFindingEvidence: prob,
        estimatedCost: 0.05,
      }),
    );
  }

  return new ResearchFrontier(items);
}
