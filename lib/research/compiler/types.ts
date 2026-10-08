import { z } from "zod";

export type ResearchTargetType = "event" | "company" | "person" | "opportunity";

export type ResearchLane =
  | "persona"
  | "transformation"
  | "technology"
  | "intent"
  | "workflow"
  | "disconfirmation";

export const RESEARCH_LANES: ResearchLane[] = [
  "persona",
  "transformation",
  "technology",
  "intent",
  "workflow",
  "disconfirmation",
];

export type WorkflowType = "p2p" | "o2c" | "ap_automation" | "order_management" | "general";

export type EvidenceFact = {
  id: string;
  slotKey: string;
  claim: string;
  sourceUrl: string;
  sourceType: string;
  confidenceBand: "confirmed" | "strong" | "moderate" | "weak" | "unverified" | "conflicted";
  retrievedAt: string;
};

export type KnowledgeGap = {
  slotKey: string;
  importance: number; // 1 to 5
  description: string;
  lane: ResearchLane;
};

export type ResearchBudget = {
  maxSearchCalls: number;
  maxScrapes: number;
  maxLLMCalls: number;
  maxTokens: number;
  maxWallTimeMs: number;
};

export const DEFAULT_ACCOUNT_BUDGET: ResearchBudget = {
  maxSearchCalls: 10,
  maxScrapes: 8,
  maxLLMCalls: 3,
  maxTokens: 30_000,
  maxWallTimeMs: 45_000,
};

export type ResearchTarget = {
  targetType: ResearchTargetType;
  targetId: string;
  name: string;
  domain?: string | null;
  eventName?: string | null;
  personName?: string | null;
  personTitle?: string | null;
  knownFacts: EvidenceFact[];
  missingFields: KnowledgeGap[];
  existingSignals: string[];
  workflowHypotheses: WorkflowType[];
  budget: ResearchBudget;
};

export const plannedQuerySchema = z.object({
  id: z.string(),
  lane: z.enum([
    "persona",
    "transformation",
    "technology",
    "intent",
    "workflow",
    "disconfirmation",
  ]),
  query: z.string().min(3),
  expectedInformationGain: z.number().min(0).max(1),
  estimatedCost: z.number().min(0.01),
  priority: z.number().min(1).max(5),
  resolves: z.array(z.string()),
  independentOf: z.array(z.string()).default([]),
});

export type PlannedQuery = z.infer<typeof plannedQuerySchema>;

export type ResearchObjective = {
  id: string;
  description: string;
  lane: ResearchLane;
  priority: number;
};

export type StopCondition = {
  type: "coverage_reached" | "utility_collapsed" | "budget_exhausted" | "max_iterations" | "critical_disconfirmed";
  threshold: number;
  description: string;
};

export type ResearchPlan = {
  targetId: string;
  queries: PlannedQuery[];
  objectives: ResearchObjective[];
  stopConditions: StopCondition[];
};

export type EvidenceCandidate = {
  url: string;
  canonicalUrl: string;
  title: string;
  snippet: string;
  publishedAt?: string | null;
  lane: ResearchLane;
  queryId: string;
  score?: number | null;
};

export type SearchUtilityItem = {
  gap: KnowledgeGap;
  query: string;
  lane: ResearchLane;
  expectedInformationGain: number;
  decisionImportance: number;
  probabilityOfFindingEvidence: number;
  estimatedCost: number;
  searchUtility: number;
};
