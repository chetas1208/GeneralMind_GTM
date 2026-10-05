/** User-facing uncertainty. The numeric score stays internal. */
export const CONFIDENCE_BANDS = ["confirmed", "strong", "moderate", "weak", "unverified", "conflicted"] as const;
export type ConfidenceBand = (typeof CONFIDENCE_BANDS)[number];

export const BAND_LABEL: Record<ConfidenceBand, string> = {
  confirmed: "Confirmed",
  strong: "Strong",
  moderate: "Moderate",
  weak: "Weak",
  unverified: "Unverified",
  conflicted: "Conflicted",
};

/** Each factor is 0–1. Higher is more supportive, except contradictionPenalty. */
export type ConfidenceFactors = {
  sourceAuthority: number;
  sourceDirectness: number;
  sourceAgreement: number;
  recency: number;
  identityResolution: number;
  dataCompleteness: number;
  /** 1 means the claim is direct. Lower means more inferential hops. */
  inferenceDistance: number;
  contradictionPenalty: number;
};

export type LlmConfidenceClassification = {
  directness: "direct" | "indirect" | "unknown";
  sourceQuality: "high" | "medium" | "low";
  agreement: "multiple_independent_sources" | "single_source" | "syndicated" | "unknown";
  contradictions: string[];
  missingEvidence: string[];
  uncertaintySummary: string;
  whyNow?: string;
  whyGeneralMind?: string;
  discoveryAngle?: string;
  evidenceIds?: string[];
};

export type ConfidenceAssessment = {
  band: ConfidenceBand;
  label: string;
  summary: string;
  why: string[];
  uncertainty: string[];
  /** 0–1 ranking aid. Not a displayed truth score. */
  internalScore: number;
  factors: ConfidenceFactors;
  contradictions: string[];
  previousBand?: ConfidenceBand | null;
  changeReason?: string | null;
};

export type ClaimKind = "attendance" | "role" | "signal" | "company_news";

export type ConfidenceClaim = {
  kind?: ClaimKind;
  attendanceType?: string;
  sourceTypes?: string[];
  sourceUrls?: Array<string | null | undefined>;
  independentSources?: number;
  retrievedAt?: string | Date | null;
  identity?: {
    roleVerified?: boolean;
    sameNameAmbiguity?: boolean;
    companyMismatch?: boolean;
    titleMismatch?: boolean;
    locationMismatch?: boolean;
    weakResolution?: boolean;
  };
  completeness?: {
    person?: boolean;
    title?: boolean;
    company?: boolean;
    event?: boolean;
    source?: boolean;
    date?: boolean;
  };
  contradictions?: string[];
  /** Explicit hop count. Attendance type supplies one when this is omitted. */
  hops?: number;
  llm?: LlmConfidenceClassification | null;
  /** Evidence ids that actually exist. Model ids outside this set are dropped. */
  allowedEvidenceIds?: string[];
  previousBand?: ConfidenceBand | null;
};

export type FitBand = "Excellent" | "Strong" | "Moderate" | "Weak";
