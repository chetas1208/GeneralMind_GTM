import { describe, expect, it } from "vitest";
import { buildEmailGuessPatterns, isVerifiedEmailStatus, pickPrimaryEmailGuess } from "@/lib/contact/email-guess";
import { emailPresentation } from "@/lib/gtm-present";

describe("email guess patterns", () => {
  it("builds first.last from name and domain", () => {
    expect(pickPrimaryEmailGuess({ fullName: "Sarah Chen", domain: "acme.com" })).toBe("sarah.chen@acme.com");
    expect(buildEmailGuessPatterns({ fullName: "Sarah Chen", domain: "acme.com" }).length).toBeGreaterThan(2);
  });

  it("normalizes www domain", () => {
    expect(pickPrimaryEmailGuess({ fullName: "Bob Smith", domain: "www.globex.io" })).toBe("bob.smith@globex.io");
  });
});

describe("email verification tiers", () => {
  it("treats guessed status as unverified", () => {
    expect(isVerifiedEmailStatus("guessed_unverified")).toBe(false);
    expect(isVerifiedEmailStatus("verified")).toBe(true);
    expect(isVerifiedEmailStatus("manual")).toBe(true);
  });

  it("labels guessed emails in UI copy", () => {
    expect(emailPresentation("a@b.com", "guessed_unverified").text).toBe("a@b.com (unverified)");
    expect(emailPresentation("a@b.com", "verified").text).toBe("a@b.com");
  });
});
