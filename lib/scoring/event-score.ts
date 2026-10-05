import { INDUSTRY_TIER_A, INDUSTRY_TIER_B } from "@/lib/icp/industries";
import type { ScoreFactor, ScoreSection } from "./types";

export type Rating = "low" | "medium" | "high";

export type EventScoreInput = {
  industryTags: string[];
  name?: string;
  description?: string | null;
  startDate?: string | null; // ISO yyyy-mm-dd
  /** Model-supplied *categorical* judgements (never numeric scores). */
  decisionMakerDensity: Rating;
  scale: Rating;
  hasOfficialUrl: boolean;
  hasSpeakerOrExhibitorList: boolean;
  now?: Date;
};

const ratingPoints = (r: Rating, high: number) => (r === "high" ? high : r === "medium" ? Math.round(high * 0.55) : Math.round(high * 0.15));

export function daysUntil(startDate: string | null | undefined, now = new Date()): number | null {
  if (!startDate) return null;
  const d = Date.parse(`${startDate}T00:00:00Z`);
  if (Number.isNaN(d)) return null;
  return Math.ceil((d - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86_400_000);
}

/** 0-100 event relevance for GeneralMind's ICP. */
export function scoreEvent(input: EventScoreInput): ScoreSection {
  const factors: ScoreFactor[] = [];
  const corpus = [...input.industryTags, input.name ?? "", input.description ?? ""].join(" ").toLowerCase();

  const tierA = INDUSTRY_TIER_A.filter((k) => corpus.includes(k));
  const tierB = INDUSTRY_TIER_B.filter((k) => corpus.includes(k));
  const industryPts = Math.min(35, tierA.length * 6 + tierB.length * 2);
  factors.push({
    key: "industry",
    label: "Industry alignment",
    points: industryPts,
    max: 35,
    note: tierA.length ? `Core verticals: ${tierA.slice(0, 4).join(", ")}` : tierB.length ? `Adjacent verticals: ${tierB.slice(0, 3).join(", ")}` : "No target-vertical signals",
  });

  factors.push({
    key: "density",
    label: "Operations/finance decision-maker presence",
    points: ratingPoints(input.decisionMakerDensity, 30),
    max: 30,
    note: `Assessed as ${input.decisionMakerDensity}`,
  });

  factors.push({
    key: "scale",
    label: "Scale / breadth of participants",
    points: ratingPoints(input.scale, 15),
    max: 15,
    note: `Assessed as ${input.scale}`,
  });

  const verif = (input.hasOfficialUrl ? 5 : 0) + (input.hasSpeakerOrExhibitorList ? 5 : 0);
  factors.push({
    key: "verifiability",
    label: "Verifiability",
    points: verif,
    max: 10,
    note: `${input.hasOfficialUrl ? "Official site found" : "No official site"}; ${input.hasSpeakerOrExhibitorList ? "public participant lists" : "no public participant lists"}`,
  });

  const days = daysUntil(input.startDate, input.now);
  let timing = 0;
  let timingNote = "Date unknown";
  if (days !== null) {
    if (days < 0) {
      timing = 0;
      timingNote = "Event already happened";
    } else if (days < 14) {
      timing = 5;
      timingNote = `Starts in ${days} days (little time to engage)`;
    } else if (days <= 300) {
      timing = 10;
      timingNote = `Starts in ${days} days`;
    } else {
      timing = 4;
      timingNote = `Starts in ${days} days (far out)`;
    }
  }
  factors.push({ key: "timing", label: "Timing", points: timing, max: 10, note: timingNote });

  const total = Math.min(100, factors.reduce((a, f) => a + f.points, 0));
  return { total, max: 100, factors };
}
