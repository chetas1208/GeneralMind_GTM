import { CONFIRMED_ATTENDANCE, MULTI_EVENT_BONUS } from "@/lib/icp/config";
import { daysUntil } from "@/lib/scoring/event-score";
import type { AttendanceKind } from "@/lib/icp/types";

export const WORK_EMAIL_POINTS = 5;
export const GUESSED_EMAIL_POINTS = 2;
export const PROFILE_ROUTE_POINTS = 3;

export type LeadPriorityInput = {
  totalScore: number;
  attendanceType: AttendanceKind;
  attendanceConfidence: number;
  eventStartDate: string | null;
  /** @deprecated use hasVerifiedWorkEmail */
  hasWorkEmail?: boolean;
  hasVerifiedWorkEmail?: boolean;
  hasGuessedWorkEmail?: boolean;
  /** A verified public profile is a usable outreach route when no work email is available. */
  hasVerifiedProfile?: boolean;
  signalFrequency: number;
  reviewStatus: string;
};

/**
 * Actionable priority (0–100) — may rank a 91/100 lead above 96/100 when event is imminent.
 */
export function computeLeadPriority(input: LeadPriorityInput, now = new Date()): number {
  let p = input.totalScore * 0.55;

  const days = daysUntil(input.eventStartDate, now);
  if (days !== null) {
    if (days < 0) p -= 15;
    else if (days <= 14) p += 18;
    else if (days <= 45) p += 12;
    else if (days <= 120) p += 6;
    else p -= 4;
  }

  p += input.attendanceConfidence * 0.15;
  if (CONFIRMED_ATTENDANCE.has(input.attendanceType)) p += 8;
  const verifiedEmail =
    input.hasVerifiedWorkEmail ?? (input.hasWorkEmail === true && !input.hasGuessedWorkEmail);
  if (verifiedEmail) p += WORK_EMAIL_POINTS;
  else if (input.hasGuessedWorkEmail) p += GUESSED_EMAIL_POINTS;
  else if (input.hasVerifiedProfile) p += PROFILE_ROUTE_POINTS;

  const freq = Math.min(3, input.signalFrequency);
  p += MULTI_EVENT_BONUS[freq] ?? 0;

  if (input.reviewStatus === "needs_review") p += 3;

  return Math.max(0, Math.min(100, Math.round(p)));
}
