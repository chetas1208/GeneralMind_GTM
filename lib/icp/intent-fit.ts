import { ATTENDANCE_CONFIDENCE, ATTENDANCE_LABEL, ATTENDANCE_POINTS, CONFIRMED_ATTENDANCE, MAX } from "./config";
import type { AttendanceKind, ScoreFactor, ScoreSection } from "./types";

export type IntentScoreInput = {
  attendanceType: AttendanceKind;
  independentSources: number;
  eventRelevance?: number | null;
};

export function scoreIntent(input: IntentScoreInput): ScoreSection {
  const base = ATTENDANCE_POINTS[input.attendanceType];
  const corroboration = input.independentSources >= 3 ? 2 : input.independentSources === 2 ? 1 : 0;

  const factors: ScoreFactor[] = [
    { key: "attendance", label: "Event relationship", points: base, max: 30, note: ATTENDANCE_LABEL[input.attendanceType] },
    {
      key: "corroboration",
      label: "Corroboration",
      points: corroboration,
      max: 2,
      note: `${input.independentSources} distinct source${input.independentSources === 1 ? "" : "s"}`,
    },
  ];
  return { total: Math.min(MAX.intent, factors.reduce((a, f) => a + f.points, 0)), max: MAX.intent, factors };
}

export function attendanceConfidence(
  type: AttendanceKind,
  opts: { independentSources: number; enrichmentConfirmsRole?: boolean },
): number {
  let c = ATTENDANCE_CONFIDENCE[type];
  if (CONFIRMED_ATTENDANCE.has(type)) {
    c += Math.min(opts.independentSources - 1, 2);
    if (opts.enrichmentConfirmsRole) c += 2;
    return Math.min(100, c);
  }
  c += Math.min(Math.max(opts.independentSources - 1, 0), 2) * 3;
  if (opts.enrichmentConfirmsRole) c += 2;
  return Math.min(65, c);
}

export function strongerAttendance(a: AttendanceKind, b: AttendanceKind): AttendanceKind {
  return ATTENDANCE_POINTS[a] >= ATTENDANCE_POINTS[b] ? a : b;
}
