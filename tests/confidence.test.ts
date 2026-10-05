import { describe, expect, it } from "vitest";
import { acceptEvidenceIds, applyLlmClassification, assessAttendance, assessConfidence } from "@/lib/confidence";
import { deriveFactors } from "@/lib/confidence/factors";

const now = Date.parse("2026-10-05T00:00:00Z");

describe("confidence bands", () => {
  it("treats an official named speaker as confirmed", () => {
    const a = assessConfidence(
      {
        attendanceType: "official_speaker",
        sourceTypes: ["official_speaker"],
        independentSources: 1,
        retrievedAt: "2026-10-01",
        identity: { roleVerified: true },
        completeness: { person: true, title: true, company: true, event: true, source: true, date: true },
      },
      now,
    );
    expect(a.band).toBe("confirmed");
    expect(a.summary).not.toMatch(/%/);
    expect(a.internalScore).toBeGreaterThan(0);
    expect(a.internalScore).toBeLessThanOrEqual(1);
  });

  it("treats independent person and company announcements as confirmed or strong", () => {
    const a = assessAttendance({
      attendanceType: "public_attendance",
      independentSources: 2,
    });
    expect(["confirmed", "strong"]).toContain(a.band);
  });

  it("treats an exhibitor employee as moderate", () => {
    const a = assessAttendance({ attendanceType: "exhibitor_employee" });
    expect(a.band).toBe("moderate");
    expect(a.summary.toLowerCase()).toContain("not verified");
  });

  it("treats a generic conference mention as weak", () => {
    const a = assessConfidence({
      attendanceType: "company_participating",
      sourceTypes: ["public_web"],
      independentSources: 1,
    });
    expect(a.band).toBe("weak");
  });

  it("treats no relationship as unverified", () => {
    const a = assessConfidence({
      attendanceType: "inferred",
      sourceTypes: [],
      independentSources: 0,
      identity: { weakResolution: true },
      completeness: { person: false, title: false, company: false, event: false, source: false, date: false },
    });
    expect(a.band).toBe("unverified");
  });

  it("marks material disagreement as conflicted", () => {
    const a = assessAttendance({
      attendanceType: "official_speaker",
      contradictions: ["Event site says speaker", "Profile says they left the company"],
    });
    expect(a.band).toBe("conflicted");
    expect(a.label).toBe("Conflicted");
  });

  it("lets a classification nudge factors without setting the score", () => {
    const base = deriveFactors({ attendanceType: "inferred", sourceTypes: [], independentSources: 0 });
    const nudged = applyLlmClassification(base, {
      directness: "direct",
      sourceQuality: "high",
      agreement: "multiple_independent_sources",
      contradictions: [],
      missingEvidence: [],
      uncertaintySummary: "",
    });
    expect(nudged.sourceAuthority - base.sourceAuthority).toBeLessThanOrEqual(0.15);
    const still = assessConfidence({
      attendanceType: "inferred",
      sourceTypes: [],
      independentSources: 0,
      identity: { weakResolution: true },
      llm: {
        directness: "direct",
        sourceQuality: "high",
        agreement: "multiple_independent_sources",
        contradictions: [],
        missingEvidence: [],
        uncertaintySummary: "vibes",
        whyNow: "They will buy",
        evidenceIds: ["made-up"],
      },
      allowedEvidenceIds: ["real"],
    });
    expect(["unverified", "weak"]).toContain(still.band);
    expect(still.uncertainty.some((u) => u.includes("not tied"))).toBe(true);
  });

  it("drops invented evidence ids", () => {
    expect(acceptEvidenceIds(["real", "invented"], ["real"])).toEqual(["real"]);
  });

  it("decays a role slower than a market signal", () => {
    const old = "2024-01-01";
    const role = deriveFactors({ kind: "role", retrievedAt: old, attendanceType: "official_speaker" }, now);
    const signal = deriveFactors({ kind: "signal", retrievedAt: old, attendanceType: "official_speaker" }, now);
    expect(role.recency).toBeGreaterThan(signal.recency);
  });
});
