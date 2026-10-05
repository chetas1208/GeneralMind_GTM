import type { WorkflowType } from "@/lib/icp/types";
import { freshnessFactor } from "./freshness";
import type { SignalDirection, SignalType } from "./types";

export type ScoredSignal = {
  id: string;
  type: SignalType;
  direction: SignalDirection;
  confidence: number;
  relevance: number;
  urgency: number;
  workflowHints: string[];
  occurredAt: Date | null;
};

/** Bounded stacking — independent sources, not syndication copies. */
export function computeSignalStackingBonus(signals: ScoredSignal[]): number {
  const active = signals.filter((s) => s.direction === "positive");
  if (active.length <= 1) return 0;
  const types = new Set(active.map((s) => s.type));
  const diversity = Math.min(4, types.size);
  let bonus = Math.min(5, (diversity - 1) * 1.5);
  const workflows = new Set(active.flatMap((s) => s.workflowHints));
  if (workflows.size >= 2 && active.length >= 3) bonus = Math.min(5, bonus + 1);
  return Math.round(bonus);
}

export function effectiveSignalStrength(s: ScoredSignal, now = new Date()): number {
  const fresh = freshnessFactor(s.type, s.occurredAt, now);
  const dir = s.direction === "negative" ? -1 : s.direction === "neutral" ? 0.3 : 1;
  return Math.round(((s.confidence * 0.35 + s.relevance * 0.45 + s.urgency * 0.2) / 100) * fresh * 100 * dir);
}

export type AccountPriorityInput = {
  accountFit: number;
  bestPersonaFit?: number;
  signals: ScoredSignal[];
  contactability?: number;
};

/** Transparent priority (0–100) — fit vs timing separated conceptually in breakdown. */
export function computeAccountPriority(input: AccountPriorityInput, now = new Date()): {
  total: number;
  breakdown: { key: string; label: string; points: number; max: number }[];
} {
  const breakdown: { key: string; label: string; points: number; max: number }[] = [];

  const fitPts = Math.round(Math.min(30, (input.accountFit / 40) * 30));
  breakdown.push({ key: "fit", label: "Account fit", points: fitPts, max: 30 });

  const personaPts = Math.round(Math.min(20, ((input.bestPersonaFit ?? 0) / 30) * 20));
  breakdown.push({ key: "persona", label: "Persona fit", points: personaPts, max: 20 });

  const strengths = input.signals.map((s) => effectiveSignalStrength(s, now)).filter((n) => n > 0);
  const signalPts = Math.min(20, Math.round(strengths.reduce((a, b) => a + b, 0) / Math.max(1, strengths.length / 2)));
  breakdown.push({ key: "signals", label: "Signal strength", points: signalPts, max: 20 });

  const evidencePts = Math.min(
    10,
    Math.round(input.signals.filter((s) => s.confidence >= 80).length * 2.5),
  );
  breakdown.push({ key: "evidence", label: "Evidence confidence", points: evidencePts, max: 10 });

  const urgencyPts = Math.min(10, Math.round(Math.max(...input.signals.map((s) => s.urgency * freshnessFactor(s.type, s.occurredAt, now)), 0) / 10));
  breakdown.push({ key: "urgency", label: "Urgency", points: urgencyPts, max: 10 });

  const stackPts = computeSignalStackingBonus(input.signals);
  breakdown.push({ key: "stack", label: "Aligned signals", points: stackPts, max: 5 });

  const contactPts = Math.min(5, input.contactability ? 4 : 0);
  breakdown.push({ key: "contact", label: "Contactability", points: contactPts, max: 5 });

  const neg = input.signals.filter((s) => s.direction === "negative").length;
  const penalty = Math.min(15, neg * 5);

  const total = Math.max(0, Math.min(100, breakdown.reduce((a, b) => a + b.points, 0) - penalty));
  return { total, breakdown };
}

export function buildWhyNow(signals: ScoredSignal[], companyName: string): string {
  const recent = [...signals]
    .filter((s) => s.direction === "positive" && effectiveSignalStrength(s) > 15)
    .sort((a, b) => effectiveSignalStrength(b) - effectiveSignalStrength(a))
    .slice(0, 4);
  if (!recent.length) return `${companyName} has no strong active market signals in Radar yet.`;
  const parts = recent.map((s) => s.type.replace(/_/g, " "));
  return `${companyName} shows ${recent.length} aligned signal${recent.length > 1 ? "s" : ""} (${parts.join(", ")}) suggesting operational change may be underway.`;
}

export function clusterWorkflows(signals: ScoredSignal[]): WorkflowType[] {
  const counts = new Map<string, number>();
  for (const s of signals) {
    for (const w of s.workflowHints) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w as WorkflowType);
}
