export type ScoreFactor = {
  key: string;
  label: string;
  points: number;
  max: number;
  note: string;
};

export type ScoreSection = {
  total: number;
  max: number;
  factors: ScoreFactor[];
};

export const PERSONAS = [
  "operations_leadership",
  "supply_chain",
  "procurement",
  "order_management",
  "finance_operations",
  "it_erp",
  "digital_transformation",
  "executive_other",
  "other",
] as const;
export type Persona = (typeof PERSONAS)[number];

export const SENIORITIES = ["c_suite", "vp", "head", "director", "manager", "individual", "unknown"] as const;
export type Seniority = (typeof SENIORITIES)[number];

export const ATTENDANCE_TYPES = [
  "official_speaker",
  "organizer",
  "public_attendance",
  "exhibitor_employee",
  "sponsor_employee",
  "partner_employee",
  "company_participating",
  "inferred",
] as const;
export type AttendanceKind = (typeof ATTENDANCE_TYPES)[number];

export type CompanyScoreInput = {
  industry?: string | null;
  description?: string | null;
  keywords?: string[];
  employeeCount?: number | null;
  country?: string | null;
  technologies?: string[];
};

export type PersonaScoreInput = {
  title?: string | null;
  /** Optional override when the deterministic title classifier is inconclusive. */
  personaOverride?: Persona | null;
  seniorityOverride?: Seniority | null;
};

export type IntentScoreInput = {
  attendanceType: AttendanceKind;
  /** Count of distinct source URLs supporting the attendance claim. */
  independentSources: number;
  eventRelevance?: number | null;
};
