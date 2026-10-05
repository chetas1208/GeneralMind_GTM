import { describe, expect, it } from "vitest";
import { eventDedupeKey } from "@/lib/db/queries/events";
import { extractJson } from "@/lib/ai/provider";
import { eventCandidateSchema, participantsSchema } from "@/lib/ai/schemas";
import { chunkText, namesMatch } from "@/lib/pipeline/stages/shared";
import { findSnippet, normalizeCompanyName, normalizeDomain, normalizeLinkedin, normalizePersonName, sanitizeText } from "@/lib/text";
import { nameTokens } from "@/lib/events/discover";

describe("deterministic normalisation (dedupe keys)", () => {
  it("collapses company name variants", () => {
    const names = ["Acme Industries, Inc.", "ACME Industries", "The Acme Industries Co.", "Acme  Industries LLC"];
    expect(new Set(names.map(normalizeCompanyName)).size).toBe(1);
  });
  it("normalises domains", () => {
    expect(normalizeDomain("https://www.HormelFoods.com/about?x=1")).toBe("hormelfoods.com");
    expect(normalizeDomain("hormelfoods.com")).toBe("hormelfoods.com");
    expect(normalizeDomain("not a domain")).toBeNull();
  });
  it("normalises person names and LinkedIn URLs", () => {
    expect(normalizePersonName("Dr. Jane  Smith, PhD")).toBe(normalizePersonName("jane smith"));
    expect(normalizeLinkedin("http://uk.linkedin.com/in/Jane-Smith/?utm_source=x")).toBe("https://www.linkedin.com/in/jane-smith");
  });
  it("event dedupe keys strip year subdomains but keep hub paths", () => {
    expect(eventDedupeKey("https://2026.modexshow.com/")).toBe("modexshow.com");
    expect(eventDedupeKey("https://www.modexshow.com/agenda")).toBe("modexshow.com");
    expect(eventDedupeKey("https://naw.org/events/shift-2027/speakers")).toBe("naw.org/events/shift-2027");
    expect(eventDedupeKey("https://nbwa.org/event/annual-convention")).toBe("nbwa.org/event/annual-convention");
  });
  it("matches company names conservatively", () => {
    expect(namesMatch("Hormel Foods", "Hormel Foods Corporation")).toBe(true);
    expect(namesMatch("Acme", "Acme Industries")).toBe(true);
    expect(namesMatch("Apple", "Pineapple Logistics")).toBe(false);
  });
  it("tokenises event names without years", () => {
    expect(nameTokens("MODEX 2027 Supply Chain Expo")).toContain("modex");
    expect(nameTokens("MODEX 2027")).not.toContain("2027");
  });
});

describe("text safety", () => {
  it("strips HTML/script and markdown links", () => {
    const out = sanitizeText('Hi <script>alert(1)</script><b>there</b> [link](http://x.com) ![img](http://y/z.png)');
    expect(out).not.toMatch(/<|script|alert|http/);
    expect(out).toContain("there");
    expect(out).toContain("link");
  });
  it("finds evidence snippets only when the name is literally present", () => {
    const text = "Keynote: Jane Smith, VP Supply Chain, Acme Industries. Panel: Bob Jones.";
    expect(findSnippet(text, "Jane Smith")).toContain("VP Supply Chain");
    expect(findSnippet(text, "Totally Invented")).toBeNull();
  });
  it("chunks long text within bounds", () => {
    const chunks = chunkText("line\n".repeat(10_000), 12_000, 3);
    expect(chunks.length).toBeLessThanOrEqual(3);
    expect(chunks.every((c) => c.length <= 12_000)).toBe(true);
  });
});

describe("AI output handling", () => {
  it("extracts JSON from fenced and chatty output", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! Here you go: {"a": [1,2]} hope that helps')).toEqual({ a: [1, 2] });
    expect(() => extractJson("no json here")).toThrow();
  });
  it("rejects structurally invalid candidates via Zod", () => {
    expect(eventCandidateSchema.safeParse({ name: "x" }).success).toBe(false);
    const ok = eventCandidateSchema.parse({ isEvent: true, name: "MODEX", startDate: "2027-04-13", endDate: "13 April" });
    expect(ok.startDate).toBe("2027-04-13");
    expect(ok.endDate).toBeNull(); // malformed dates become null, never guessed
  });
  it("tolerates unknown relationships by defaulting to unknown", () => {
    const p = participantsSchema.parse({ companies: [{ name: "Acme", relationship: "gold-tier-llama" }], people: [] });
    expect(p.companies[0].relationship).toBe("unknown");
  });
});
