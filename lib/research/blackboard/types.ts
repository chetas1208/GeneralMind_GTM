export type SlotState =
  | "unknown"
  | "partial"
  | "supported"
  | "conflicted"
  | "not_applicable";

export type ConfidenceBand =
  | "confirmed"
  | "strong"
  | "moderate"
  | "weak"
  | "unverified"
  | "conflicted";

export type KnowledgeSlot = {
  key: string;
  category: "company" | "technology" | "personas" | "signals" | "workflow" | "negative";
  label: string;
  weight: number; // 1 to 5 for coverage calculation
  state: SlotState;
  value?: string | null;
  confidenceBand: ConfidenceBand;
  evidenceIds: string[];
  lastUpdatedAt: string;
};

export type EvidenceClaim = {
  id: string;
  slotKey: string;
  claim: string;
  excerpt: string;
  sourceUrl: string;
  sourceType: string;
  lane: string;
  confidence: number; // 0 to 100
  retrievedAt: string;
};

export type ContradictionItem = {
  slotKey: string;
  claimA: EvidenceClaim;
  claimB: EvidenceClaim;
  detectedAt: string;
  resolved: boolean;
  resolution?: string | null;
};
