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

import { classifyErpStage } from "@/lib/signals/adapters/erp";
import { companyMentions, isLookalikeSource, looksLikeSpecificRole, roleRelevance, verifyNearCompany } from "@/lib/signals/verify";
import type { SignalCandidate } from "@/lib/signals/types";

function cand(over: Partial<SignalCandidate>): SignalCandidate {
  return { type: "erp_transformation", title: "t", summary: "", sourceUrl: "https://x.com", confidence: 70, relevance: 70, urgency: 50, ...over };
}

describe("source verification precision", () => {
  it("rejects look-alike domains that describe a different entity", () => {
    expect(isLookalikeSource("https://www.tvhconsulting.com/sap-migration", "TVH", "tvh.com")).toBe(true);
    expect(isLookalikeSource("https://www.tvh.com/news/plant-t", "TVH", "tvh.com")).toBe(false);
    expect(isLookalikeSource("https://www.tvh.be/en/news", "TVH", "tvh.com")).toBe(false);
    expect(isLookalikeSource("https://supplychaindigital.com/people-moves", "TVH", "tvh.com")).toBe(false);
  });

  it("matches company names as whole words only", () => {
    expect(companyMentions("TVH opens a plant. tvh again", "TVH")).toHaveLength(2);
    expect(companyMentions("ATVHub is unrelated", "TVH")).toHaveLength(0);
  });

  it("requires the claim to sit near the company mention", () => {
    const near = cand({ title: "x", metadata: { fullTextForVerification: "Acme Corp is migrating to SAP S/4HANA across all plants." } });
    const far = cand({ title: "x", metadata: { fullTextForVerification: `Acme Corp is a manufacturer. ${"filler ".repeat(200)} A guide to SAP S/4HANA migration.` } });
    const re = /S\/4\s?HANA/i;
    expect(verifyNearCompany(near, [re], "Acme Corp")).toBe(true);
    expect(verifyNearCompany(far, [re], "Acme Corp")).toBe(false);
    expect(verifyNearCompany(cand({ metadata: { fullTextForVerification: "SAP S/4HANA migration news" } }), [re], "Acme Corp")).toBe(false);
  });

  it("separates careers landing pages from postings and weights role seniority", () => {
    expect(looksLikeSpecificRole("WK Kellogg Supply Chain Careers")).toBe(false);
    expect(looksLikeSpecificRole("Director, Procurement Transformation")).toBe(true);
    expect(roleRelevance("Director, Procurement Transformation")).toBeGreaterThan(roleRelevance("Functional Analyst Order Management"));
  });

  it("requires a relevant function in the title for high hiring relevance", () => {
    expect(roleRelevance("Director of Carrier Integration & Partnerships")).toBeLessThan(70);
    expect(roleRelevance("SAP Transformation Lead")).toBeGreaterThanOrEqual(72);
    expect(roleRelevance("Director, Procurement Transformation")).toBe(90);
  });

  it("classifies ERP programme stage", () => {
    expect(classifyErpStage("The company went live on S/4HANA in March")).toBe("completed");
    expect(classifyErpStage("The S/4HANA rollout is underway, wave 2 next quarter")).toBe("underway");
    expect(classifyErpStage("Acme announced a move to S/4HANA")).toBe("announced");
  });
});
