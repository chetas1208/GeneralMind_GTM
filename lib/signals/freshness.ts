import type { SignalType } from "./types";

/** Effective urgency multiplier after time decay (0–1). */
export function freshnessFactor(type: SignalType, occurredAt: Date | null | undefined, now = new Date()): number {
  if (!occurredAt) return 0.85;
  const days = (now.getTime() - occurredAt.getTime()) / 86_400_000;

  switch (type) {
    case "event":
      if (days < 0) return 1; // upcoming
      if (days <= 30) return 0.2;
      return 0.05;
    case "executive_change":
      if (days <= 90) return 1;
      if (days <= 180) return 0.65;
      if (days <= 365) return 0.35;
      return 0.15;
    case "hiring":
    case "job_posting":
      if (days <= 45) return 1;
      if (days <= 120) return 0.5;
      return 0.2;
    case "erp_transformation":
      if (days <= 730) return 0.9;
      return 0.4;
    case "expansion":
    case "ma":
    case "funding":
      if (days <= 180) return 0.95;
      if (days <= 540) return 0.55;
      return 0.25;
    default:
      if (days <= 90) return 1;
      if (days <= 365) return 0.5;
      return 0.2;
  }
}

export function isExpired(type: SignalType, occurredAt: Date | null | undefined, now = new Date()): boolean {
  return freshnessFactor(type, occurredAt, now) < 0.1;
}
