import { describe, expect, it } from "vitest";
import { scoreCompany, detectErpSignals } from "@/lib/scoring/company-score";
import { classifyTitle, scorePersona } from "@/lib/scoring/persona-score";
import { attendanceConfidence, scoreIntent } from "@/lib/scoring/intent-score";
import { scoreLead } from "@/lib/scoring/total-score";
import { scoreEvent } from "@/lib/scoring/event-score";

describe("title classification", () => {
  it.each([
    ["VP Supply Chain", "supply_chain", "vp"],
    ["Chief Operating Officer", "operations_leadership", "c_suite"],
    ["Head of Procurement", "procurement", "head"],
    ["Director, Accounts Payable", "finance_operations", "director"],
    ["Director of Enterprise Applications", "it_erp", "director"],
    ["Senior Director Order Management", "order_management", "director"],
  ])("%s", (title, persona, seniority) => {
    const c = classifyTitle(title);
    expect(c.persona).toBe(persona);
    expect(c.seniority).toBe(seniority);
  });

  it("flags unknown titles as inconclusive instead of guessing", () => {
    expect(classifyTitle("Chief Happiness Wizard").persona).not.toBe("supply_chain");
    expect(classifyTitle("Gardener").inconclusive).toBe(true);
    expect(classifyTitle(null).inconclusive).toBe(true);
  });
});

describe("company score", () => {
  it("rewards a mid-market manufacturer on SAP in the US", () => {
    const s = scoreCompany({ industry: "food production", employeeCount: 20_000, country: "United States", description: "Global food processing with supply chain and distribution across plants", technologies: ["SAP S/4HANA", "Oracle Netsuite"] });
    expect(s.total).toBeGreaterThanOrEqual(26);
    expect(s.max).toBe(40);
  });
  it("scores an unknown company low rather than inventing fit", () => {
    expect(scoreCompany({}).total).toBeLessThanOrEqual(2);
  });
  it("does not treat 'sapient' as SAP", () => {
    expect(detectErpSignals(["Sapient Razorfish"])).toEqual([]);
    expect(detectErpSignals(["SAP Ariba", "Microsoft Dynamics 365"])).toHaveLength(2);
  });
  it("never exceeds 40", () => {
    expect(scoreCompany({ industry: "manufacturing", employeeCount: 5000, country: "USA", description: "supply chain procurement warehouse logistics manufacturing plants", technologies: ["SAP", "Oracle"] }).total).toBeLessThanOrEqual(40);
  });
});

describe("intent score and attendance confidence", () => {
  it("never scores a sponsor employee like an official speaker", () => {
    const speaker = scoreIntent({ attendanceType: "official_speaker", independentSources: 1, eventRelevance: 80 });
    const sponsor = scoreIntent({ attendanceType: "sponsor_employee", independentSources: 1, eventRelevance: 80 });
    expect(speaker.total).toBeGreaterThan(sponsor.total + 8);
  });
  it("keeps unconfirmed attendance below confirmed tiers", () => {
    expect(attendanceConfidence("exhibitor_employee", { independentSources: 1 })).toBeLessThan(70);
    expect(attendanceConfidence("exhibitor_employee", { independentSources: 5, enrichmentConfirmsRole: true })).toBeLessThanOrEqual(65);
    expect(attendanceConfidence("inferred", { independentSources: 3 })).toBeLessThan(65);
  });
  it("confirmed speakers are high confidence", () => {
    expect(attendanceConfidence("official_speaker", { independentSources: 1 })).toBeGreaterThanOrEqual(95);
    expect(attendanceConfidence("official_speaker", { independentSources: 2, enrichmentConfirmsRole: true })).toBeLessThanOrEqual(100);
  });
});

describe("total score", () => {
  const company = { industry: "food production", employeeCount: 20_000, country: "United States", technologies: ["SAP"], description: "supply chain distribution plants" };
  it("sums to at most 100 and is deterministic", () => {
    const input = { company, persona: { title: "VP Supply Chain" }, intent: { attendanceType: "official_speaker" as const, independentSources: 2, eventRelevance: 90 } };
    const a = scoreLead(input);
    const b = scoreLead(input);
    expect(a).toEqual(b);
    expect(a.total).toBe(a.company.total + a.persona.total + a.intent.total);
    expect(a.total).toBeLessThanOrEqual(100);
    expect(a.total).toBeGreaterThanOrEqual(80);
  });
  it("same person scores lower as an exhibitor employee than as a speaker", () => {
    const base = { company, persona: { title: "VP Supply Chain" } };
    const speaker = scoreLead({ ...base, intent: { attendanceType: "official_speaker", independentSources: 1, eventRelevance: 80 } });
    const employee = scoreLead({ ...base, intent: { attendanceType: "exhibitor_employee", independentSources: 1, eventRelevance: 80 } });
    expect(speaker.total).toBeGreaterThan(employee.total);
    expect(employee.attendanceConfidence).toBeLessThan(speaker.attendanceConfidence);
  });
});

describe("event score", () => {
  it("is computed by code from categorical ratings", () => {
    const hi = scoreEvent({ industryTags: ["manufacturing", "supply chain", "logistics"], decisionMakerDensity: "high", scale: "high", hasOfficialUrl: true, hasSpeakerOrExhibitorList: true, startDate: "2027-03-01", now: new Date("2026-10-05") });
    const lo = scoreEvent({ industryTags: ["marketing"], decisionMakerDensity: "low", scale: "low", hasOfficialUrl: false, hasSpeakerOrExhibitorList: false, startDate: "2027-03-01", now: new Date("2026-10-05") });
    expect(hi.total).toBeGreaterThan(lo.total + 40);
    expect(hi.total).toBeLessThanOrEqual(100);
  });
  it("gives no timing credit to events that already happened", () => {
    const past = scoreEvent({ industryTags: [], decisionMakerDensity: "high", scale: "high", hasOfficialUrl: true, hasSpeakerOrExhibitorList: true, startDate: "2026-01-01", now: new Date("2026-10-05") });
    expect(past.factors.find((f) => f.key === "timing")?.points).toBe(0);
  });
});

describe("persona score", () => {
  it("combines function and seniority", () => {
    expect(scorePersona({ title: "Chief Supply Chain Officer" }).total).toBeGreaterThanOrEqual(28);
    expect(scorePersona({ title: "Marketing Manager" }).total).toBeLessThan(10);
  });
});
