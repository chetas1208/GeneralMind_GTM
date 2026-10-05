import { describe, expect, it } from "vitest";
import {
  isLinkedinProfileUrl,
  mentionsCompany,
  nameFromProfileTitle,
  personNamesMatch,
  profileHeader,
  verifyByExperience,
  verifyByHeadline,
  verifyProfile,
  worthReading,
} from "@/lib/contact/profile-match";

describe("personNamesMatch", () => {
  it("accepts the same person with accents, credentials and nicknames", () => {
    expect(personNamesMatch("Jörg Weidenfeld", "Jorg Weidenfeld")).toBe(true);
    expect(personNamesMatch("Jane Smith", "Jane Smith, MBA")).toBe(true);
    expect(personNamesMatch("Chris Nielsen", "Christopher Nielsen")).toBe(true);
  });
  it("rejects different people and single names", () => {
    expect(personNamesMatch("Jane Smith", "John Smith")).toBe(false);
    expect(personNamesMatch("Jane Smith", "Jane Smythe")).toBe(false);
    expect(personNamesMatch("Jane", "Jane Smith")).toBe(false);
    expect(personNamesMatch(null, "Jane Smith")).toBe(false);
  });
});

describe("isLinkedinProfileUrl", () => {
  it("only accepts personal profile pages", () => {
    expect(isLinkedinProfileUrl("https://www.linkedin.com/in/jane-smith-123")).toBe(true);
    expect(isLinkedinProfileUrl("https://de.linkedin.com/in/jane-smith/")).toBe(true);
    expect(isLinkedinProfileUrl("https://www.linkedin.com/company/acme")).toBe(false);
    expect(isLinkedinProfileUrl("https://www.linkedin.com/posts/jane_abc")).toBe(false);
    expect(isLinkedinProfileUrl("https://notlinkedin.com/in/jane")).toBe(false);
    expect(isLinkedinProfileUrl("not a url")).toBe(false);
  });
});

describe("verifyProfile", () => {
  const text = "Jane Smith\nVice President, Supply Chain at Acme Industries\nGreater Chicago Area. Experience: Acme Industries 2019 – Present.";
  const role = { fullName: "Jane Smith", isCurrent: true, currentTitle: "Vice President, Supply Chain", currentCompany: "Acme Industries", quote: "Vice President, Supply Chain at Acme Industries" };
  const expected = { fullName: "Jane Smith", companyName: "Acme Industries, Inc." };

  it("accepts a profile whose quote, name and employer all check out", () => {
    expect(verifyProfile({ expected, role, pageText: text })).toEqual({ ok: true });
  });
  it("rejects an invented quote that is not on the page", () => {
    const v = verifyProfile({ expected, role: { ...role, quote: "Chief Executive Officer at Acme Industries" }, pageText: text });
    expect(v).toMatchObject({ ok: false });
  });
  it("rejects a namesake at a different company", () => {
    const v = verifyProfile({ expected: { ...expected, companyName: "Globex" }, role, pageText: text });
    expect(v).toMatchObject({ ok: false, reason: "current company does not match" });
  });
  it("rejects a different person with the same employer", () => {
    const v = verifyProfile({ expected: { ...expected, fullName: "Janet Smith" }, role, pageText: text });
    expect(v).toMatchObject({ ok: false, reason: "name does not match" });
  });
  it("rejects a former role", () => {
    expect(verifyProfile({ expected, role: { ...role, isCurrent: false }, pageText: text })).toMatchObject({ ok: false });
  });
});

describe("personNamesMatch — false-positive guards", () => {
  it("does not treat prefixes as the same person", () => {
    for (const [a, b] of [["Jane Smith", "Janet Smith"], ["Ann Lee", "Anna Lee"], ["Al Cruz", "Alan Cruz"], ["Jan Weber", "Janet Weber"]]) {
      expect(personNamesMatch(a, b), `${a} vs ${b}`).toBe(false);
    }
  });
});

describe("German name forms", () => {
  it("treats Jörg, Joerg and Jorg as the same first name", () => {
    expect(personNamesMatch("Jörg Weidenfeld", "Joerg Weidenfeld")).toBe(true);
    expect(personNamesMatch("Jorg Weidenfeld", "Jörg Weidenfeld")).toBe(true);
    expect(personNamesMatch("Hans Müller", "Hans Mueller")).toBe(true);
  });
  it("still separates genuinely different names", () => {
    expect(personNamesMatch("Jörg Weidenfeld", "Julian Weidenfeld")).toBe(false);
  });
});

describe("worthReading pre-filter", () => {
  const expected = { fullName: "Jörg Weidenfeld", companyName: "Savify AG" };
  it("extracts the person name from a result title", () => {
    expect(nameFromProfileTitle("Joerg Weidenfeld - CEO - Savify | LinkedIn")).toBe("Joerg Weidenfeld");
    expect(nameFromProfileTitle("Joerg Weidenfeld")).toBe("Joerg Weidenfeld");
  });
  it("passes the right person who names the employer", () => {
    expect(worthReading({ expected, title: "Joerg Weidenfeld", pageText: "CEO Savify AG | Serial Entrepreneur" })).toBe(true);
  });
  it("drops relatives and namesakes before any LLM call", () => {
    expect(worthReading({ expected, title: "Julian Weidenfeld", pageText: "Works at Savify AG" })).toBe(false);
    expect(worthReading({ expected, title: "Joerg Weidenfeld", pageText: "CEO of Other Corp" })).toBe(false);
  });
  it("matches the employer as whole words only", () => {
    expect(mentionsCompany("Works at Pineapple Logistics", "Apple Inc.")).toBe(false);
    expect(mentionsCompany("VP at Apple", "Apple Inc.")).toBe(true);
  });
});

describe("verifyByHeadline (no LLM)", () => {
  const expected = { fullName: "Jörg Weidenfeld", companyName: "Savify AG" };
  const page = "# Joerg Weidenfeld\nCEO Savify AG | Serial Entrepreneur | Procurement Innovator\nSankt Gallen, Switzerland\n500 connections\n## About\nI have led 20 organizations.";
  it("reads name and headline from the header block only", () => {
    expect(profileHeader(page).name).toBe("Joerg Weidenfeld");
    expect(profileHeader(page).headline).toContain("CEO Savify AG");
    expect(profileHeader(page).headline).not.toContain("led 20 organizations");
  });
  it("accepts when the headline names the employer", () => {
    expect(verifyByHeadline({ expected, pageText: page, pageTitle: "Joerg Weidenfeld" })).toMatchObject({ ok: true });
  });
  it("rejects when the employer appears only in the body, not the headline", () => {
    const body = "# Joerg Weidenfeld\nBoard member | Advisor\nZurich\n## About\nI worked with Savify AG for years.";
    expect(verifyByHeadline({ expected, pageText: body, pageTitle: "Joerg Weidenfeld" })).toMatchObject({ ok: false, reason: "headline does not name the employer" });
  });
  it("rejects former roles", () => {
    const former = "# Joerg Weidenfeld\nFormer CEO Savify AG | Advisor\nZurich\n## About\nx";
    expect(verifyByHeadline({ expected, pageText: former, pageTitle: "Joerg Weidenfeld" })).toMatchObject({ ok: false, reason: "headline describes a former role" });
    const ex = "# Joerg Weidenfeld\nex-Savify AG, now consulting\n## About\nx";
    expect(verifyByHeadline({ expected, pageText: ex, pageTitle: "Joerg Weidenfeld" })).toMatchObject({ ok: false });
  });
  it("rejects a different person", () => {
    expect(verifyByHeadline({ expected, pageText: page.replace("Joerg", "Julian"), pageTitle: "Julian Weidenfeld" })).toMatchObject({ ok: false, reason: "name does not match" });
  });
});

describe("verifyProfile — quote must support the claim", () => {
  it("rejects a verbatim quote that does not name the employer", () => {
    const text = "Jane Smith\nProcurement alliance with high volume spend. Effortless Savings!";
    const role = { fullName: "Jane Smith", isCurrent: true, currentTitle: "CEO", currentCompany: "Acme Industries", quote: "Procurement alliance with high volume spend. Effortless Savings!" };
    expect(verifyProfile({ expected: { fullName: "Jane Smith", companyName: "Acme Industries" }, role, pageText: text })).toMatchObject({ ok: false, reason: "quoted text does not name the employer" });
  });
});

describe("verifyByExperience (no LLM)", () => {
  const expected = { fullName: "Antione Bennett", companyName: "Gap, Inc" };
  const page = `# Antione Bennett, MBA
Head of Supply Chain/Transportation Procurement
Columbus, Ohio
## About
Lead Strategic Sourcing for Gap Inc.
## Experience
### [Gap Inc.](https://www.linkedin.com/company/gap-inc-)
#### Head of Supply Chain Transportation Sourcing (Current)
Feb 2022 - Present (4 years and 7 months) in United States
### Acme Corp
#### Buyer
2001 - 2005`;
  it("accepts a current role under a matching company heading", () => {
    const v = verifyByExperience({ expected, pageText: page, pageTitle: "Antione Bennett, MBA" });
    expect(v).toMatchObject({ ok: true });
    expect(v.ok && v.statement).toContain("Head of Supply Chain Transportation Sourcing");
  });
  it("rejects a past role at the employer", () => {
    const past = page.replace("(Current)", "").replace("Feb 2022 - Present (4 years and 7 months)", "Feb 2010 - Mar 2015 (5 years)");
    expect(verifyByExperience({ expected, pageText: past, pageTitle: "Antione Bennett" })).toMatchObject({ ok: false });
  });
  it("does not leak a Present role from the NEXT company onto this one", () => {
    const other = "# Antione Bennett\nx\n## Experience\n### Gap Inc.\n#### Buyer\n2001 - 2005\n### Globex\n#### CEO (Current)\n2020 - Present";
    expect(verifyByExperience({ expected, pageText: other, pageTitle: "Antione Bennett" })).toMatchObject({ ok: false });
  });
  it("rejects a different person even if the employer matches", () => {
    expect(verifyByExperience({ expected, pageText: page, pageTitle: "Anthony Bennett" })).toMatchObject({ ok: false, reason: "name does not match" });
  });
});

describe("evidence text is plain", () => {
  it("strips markdown links from experience statements", () => {
    const page = "# Jane Smith\nhead\n## Experience\n### [Sanofi](https://www.linkedin.com/company/sanofi)\n#### Head of Logistics - [Sanofi](https://www.linkedin.com/company/sanofi) (Current)\nJan 2026 - Present";
    const v = verifyByExperience({ expected: { fullName: "Jane Smith", companyName: "Sanofi" }, pageText: page, pageTitle: "Jane Smith" });
    expect(v.ok && v.statement).not.toMatch(/\]\(|https?:/);
  });
});
