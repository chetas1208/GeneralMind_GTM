import { describe, expect, it } from "vitest";
import { domainPlausible, pickCompanyDomain } from "@/lib/company-domain";

describe("pickCompanyDomain", () => {
  it("accepts a domain that spells the company", () => {
    expect(pickCompanyDomain("Oliver Wyman", [{ url: "https://www.oliverwyman.com/", title: "Oliver Wyman" }])).toBe("oliverwyman.com");
  });
  it("accepts a short domain only when the site root names the company", () => {
    expect(pickCompanyDomain("Johnson & Johnson", [{ url: "https://www.jnj.com/", title: "Johnson & Johnson | Healthcare" }])).toBe("jnj.com");
    expect(pickCompanyDomain("Johnson & Johnson", [{ url: "https://www.jnj.com/news/story", title: "Johnson & Johnson | Healthcare" }])).toBeNull();
    expect(pickCompanyDomain("Johnson & Johnson", [{ url: "https://www.jnj.com/", title: "Some other company" }])).toBeNull();
  });
  it("never accepts aggregators or social profiles", () => {
    expect(pickCompanyDomain("Acme", [{ url: "https://www.linkedin.com/company/acme", title: "Acme" }, { url: "https://en.wikipedia.org/wiki/Acme", title: "Acme" }, { url: "https://www.crunchbase.com/", title: "Acme" }])).toBeNull();
  });
  it("keeps the original label check", () => {
    expect(domainPlausible("Acme Industries", "acme.com")).toBe(true);
    expect(domainPlausible("Acme Industries", "globex.com")).toBe(false);
  });
});
