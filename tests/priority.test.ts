import { describe, expect, it } from "vitest";
import { computeLeadPriority } from "@/lib/intelligence/ranking/lead-priority";
import { computeAccountPriority } from "@/lib/signals/scoring";

describe("contactability in account priority", () => {
  const base = { accountFit: 30, signals: [] };
  const pts = (c: number) => computeAccountPriority({ ...base, contactability: c }).breakdown.find((b) => b.key === "contact")?.points;
  it("rewards a work email most, a verified profile some, nothing otherwise", () => {
    expect(pts(5)).toBe(5);
    expect(pts(3)).toBe(3);
    expect(pts(0)).toBe(0);
  });
  it("clamps out-of-range input", () => {
    expect(pts(99)).toBe(5);
    expect(pts(-4)).toBe(0);
  });
});

describe("lead priority by contact route", () => {
  const base = { totalScore: 80, attendanceType: "official_speaker" as const, attendanceConfidence: 90, eventStartDate: null, signalFrequency: 1, reviewStatus: "needs_review" as const };
  const p = (x: { hasWorkEmail: boolean; hasVerifiedProfile?: boolean }) => computeLeadPriority({ ...base, ...x } as Parameters<typeof computeLeadPriority>[0]);
  it("ranks verified email > verified profile > no route, without double counting", () => {
    const email = p({ hasWorkEmail: true, hasVerifiedProfile: true });
    const profile = p({ hasWorkEmail: false, hasVerifiedProfile: true });
    const none = p({ hasWorkEmail: false, hasVerifiedProfile: false });
    expect(email - profile).toBe(2);
    expect(profile - none).toBe(3);
    expect(email).toBe(p({ hasWorkEmail: true, hasVerifiedProfile: false }));
  });

  it("guessed email adds less priority than a verified profile-only route", () => {
    const base = { totalScore: 80, attendanceType: "official_speaker" as const, attendanceConfidence: 90, eventStartDate: null, signalFrequency: 1, reviewStatus: "needs_review" as const };
    const guessed = computeLeadPriority({ ...base, hasGuessedWorkEmail: true });
    const profile = computeLeadPriority({ ...base, hasVerifiedProfile: true });
    const none = computeLeadPriority({ ...base });
    expect(guessed - none).toBe(2);
    expect(profile - none).toBe(3);
  });
});
