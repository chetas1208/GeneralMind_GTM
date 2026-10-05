import { describe, expect, it } from "vitest";
import { freshnessFactor } from "@/lib/signals/freshness";
import { computeSignalStackingBonus, effectiveSignalStrength } from "@/lib/signals/scoring";
import type { ScoredSignal } from "@/lib/signals/scoring";

function sig(partial: Partial<ScoredSignal> & Pick<ScoredSignal, "type">): ScoredSignal {
  return {
    id: "s1",
    direction: "positive",
    confidence: 85,
    relevance: 80,
    urgency: 70,
    workflowHints: ["purchase_order_creation"],
    occurredAt: new Date(),
    ...partial,
  };
}

describe("signal stacking", () => {
  it("rewards diverse signal types with bounded bonus", () => {
    const signals: ScoredSignal[] = [
      sig({ id: "1", type: "executive_change" }),
      sig({ id: "2", type: "hiring", workflowHints: ["supplier_communication"] }),
      sig({ id: "3", type: "erp_transformation", workflowHints: ["purchase_order_creation", "supplier_communication"] }),
    ];
    expect(computeSignalStackingBonus(signals)).toBeGreaterThan(0);
    expect(computeSignalStackingBonus(signals)).toBeLessThanOrEqual(5);
  });

  it("does not stack duplicate types as four independent hits", () => {
    const one = computeSignalStackingBonus([sig({ id: "1", type: "hiring" }), sig({ id: "2", type: "hiring" })]);
    const diverse = computeSignalStackingBonus([
      sig({ id: "1", type: "hiring" }),
      sig({ id: "2", type: "expansion" }),
      sig({ id: "3", type: "event" }),
    ]);
    expect(diverse).toBeGreaterThan(one);
  });
});

describe("signal freshness", () => {
  it("decays old executive changes faster than recent", () => {
    const recent = freshnessFactor("executive_change", new Date(), new Date());
    const old = freshnessFactor("executive_change", new Date(Date.now() - 400 * 86400000), new Date());
    expect(recent).toBeGreaterThan(old);
  });
});

describe("negative signals", () => {
  it("reduce effective strength", () => {
    const pos = effectiveSignalStrength(sig({ type: "hiring", direction: "positive" }));
    const neg = effectiveSignalStrength(sig({ type: "hiring", direction: "negative" }));
    expect(neg).toBeLessThan(0);
    expect(pos).toBeGreaterThan(0);
  });
});
