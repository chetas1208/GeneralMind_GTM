import type { WorkflowType } from "@/lib/icp/types";

export type SignalType =
  | "event"
  | "hiring"
  | "erp_transformation"
  | "executive_change"
  | "expansion"
  | "ma"
  | "operational_initiative"
  | "digital_transformation"
  | "procurement_initiative"
  | "supply_chain_initiative"
  | "finance_transformation"
  | "automation_initiative"
  | "job_posting"
  | "technology_adoption"
  | "company_announcement"
  | "funding";

export type SignalDirection = "positive" | "negative" | "neutral";
export type SignalStatus = "candidate" | "verified" | "rejected" | "expired";

export type SignalCandidate = {
  type: SignalType;
  direction?: SignalDirection;
  title: string;
  summary: string;
  sourceUrl: string;
  sourceTitle?: string | null;
  evidenceText?: string;
  occurredAt?: Date | null;
  expiresAt?: Date | null;
  confidence: number;
  relevance: number;
  urgency: number;
  workflowHints?: WorkflowType[];
  personId?: string | null;
  eventId?: string | null;
  eventLeadId?: string | null;
  metadata?: Record<string, unknown>;
};

export type SignalDiscoveryInput = {
  companyId: string;
  companyName: string;
  domain?: string | null;
};

export type VerifiedSignal = SignalCandidate & { dedupeKey: string };

export interface SignalAdapter {
  id: string;
  discover(input: SignalDiscoveryInput): Promise<SignalCandidate[]>;
  verify(candidate: SignalCandidate, input: SignalDiscoveryInput): Promise<VerifiedSignal | null>;
}
