import type { AttendanceKind } from "./types";

/** Bump when ICP weights change — persisted scores remain explainable. */
export const SCORING_VERSION = "icp-v2";

export const MAX = { company: 40, persona: 30, intent: 30 } as const;

export const LEAD_QUALIFY_THRESHOLD = 55;
export const LEAD_STRONG_THRESHOLD = 75;
export const LEAD_GOLD_THRESHOLD = 90;

export const EVENT_RELEVANCE_THRESHOLD = 65;
export const EVENT_RELEVANCE_STRONG = 75;
export const EVENT_RELEVANCE_EXCEPTIONAL = 85;

/** Minimum public company pre-score (of 20) before Apollo org enrichment. */
export const COMPANY_PRESCORE_ENRICH_MIN = 12;

/** Minimum company fit (of 40) to enter people search queue. */
export const COMPANY_QUALIFY_MIN = 20;

export const GEO = {
  primary: ["united states", "usa", "canada", "us"],
  secondary: ["united kingdom", "uk", "germany", "netherlands", "france", "ireland", "australia", "sweden", "denmark"],
} as const;

export const ATTENDANCE_POINTS: Record<AttendanceKind, number> = {
  official_speaker: 30,
  organizer: 28,
  public_attendance: 27,
  exhibitor_employee: 16,
  sponsor_employee: 14,
  partner_employee: 12,
  company_participating: 8,
  inferred: 2,
};

export const ATTENDANCE_CONFIDENCE: Record<AttendanceKind, number> = {
  official_speaker: 98,
  organizer: 95,
  public_attendance: 90,
  exhibitor_employee: 60,
  sponsor_employee: 55,
  partner_employee: 50,
  company_participating: 40,
  inferred: 25,
};

export const CONFIRMED_ATTENDANCE: ReadonlySet<AttendanceKind> = new Set(["official_speaker", "organizer", "public_attendance"]);

export const ATTENDANCE_LABEL: Record<AttendanceKind, string> = {
  official_speaker: "Confirmed speaker",
  organizer: "Event organizer",
  public_attendance: "Public attendance statement",
  exhibitor_employee: "Employee of exhibitor (personal attendance not confirmed)",
  sponsor_employee: "Employee of sponsor (personal attendance not confirmed)",
  partner_employee: "Employee of partner (personal attendance not confirmed)",
  company_participating: "Company participating (person not confirmed)",
  inferred: "Weak inference",
};

/** Multi-event signal bonus (applied to priority, not raw fit cap). */
export const MULTI_EVENT_BONUS: Record<number, number> = { 1: 0, 2: 2, 3: 3 };
