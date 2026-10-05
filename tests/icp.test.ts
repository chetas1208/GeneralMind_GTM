import { describe, expect, it } from "vitest";
import { isNegativePersona, prescoreCompanyPublic, scoreCompanyFit, scorePersonaFit, scoreIntent, attendanceConfidence } from "@/lib/icp";
import { computeLeadPriority } from "@/lib/intelligence/ranking/lead-priority";
import { classifyTitle } from "@/lib/icp/personas";

describe("ICP persona filters", () => {
  it("rejects marketing and recruiting titles", () => {
    expect(isNegativePersona("VP Marketing")).toBe(true);
    expect(isNegativePersona("Head of Procurement")).toBe(false);
  });

  it("classifies industrial operations leaders", () => {
    expect(classifyTitle("Chief Operating Officer").persona).toBe("operations_leadership");
    expect(classifyTitle("VP Supply Chain").seniority).toBe("vp");
  });
});

describe("company pre-score gate", () => {
  it("boosts exhibitors before enrichment spend", () => {
    const weak = prescoreCompanyPublic({ name: "Acme Software", eventAssociation: "unknown" });
    const strong = prescoreCompanyPublic({ name: "Acme Manufacturing", industry: "industrial manufacturing", eventAssociation: "exhibitor" });
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeGreaterThanOrEqual(12);
  });
});

describe("scoring v2 behavior", () => {
  it("strong industrial COO scores high on company + persona", () => {
    const company = scoreCompanyFit({
      industry: "food production",
      employeeCount: 20_000,
      country: "United States",
      description: "global supply chain procurement and distribution",
      technologies: ["SAP S/4HANA"],
    });
    const persona = scorePersonaFit({ title: "Chief Operating Officer" });
    expect(company.total).toBeGreaterThanOrEqual(28);
    expect(persona.total).toBeGreaterThanOrEqual(22);
  });

  it("confirmed speaker beats exhibitor employee on intent", () => {
    const speaker = scoreIntent({ attendanceType: "official_speaker", independentSources: 1 });
    const exhibitor = scoreIntent({ attendanceType: "exhibitor_employee", independentSources: 1 });
    expect(speaker.total).toBeGreaterThan(exhibitor.total + 10);
    expect(attendanceConfidence("official_speaker", { independentSources: 1 })).toBeGreaterThanOrEqual(98);
    expect(attendanceConfidence("exhibitor_employee", { independentSources: 1 })).toBeLessThan(65);
  });

  it("priority favors imminent events with strong fit", () => {
    const far = computeLeadPriority({
      totalScore: 96,
      attendanceType: "official_speaker",
      attendanceConfidence: 98,
      eventStartDate: "2027-06-01",
      hasWorkEmail: true,
      signalFrequency: 1,
      reviewStatus: "needs_review",
    });
    const soon = computeLeadPriority({
      totalScore: 91,
      attendanceType: "official_speaker",
      attendanceConfidence: 95,
      eventStartDate: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
      hasWorkEmail: true,
      signalFrequency: 1,
      reviewStatus: "needs_review",
    });
    expect(soon).toBeGreaterThan(far);
  });
});
