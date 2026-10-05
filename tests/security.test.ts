import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  isOpenDevMode,
  passwordMatches,
  readAuthConfig,
  readCookie,
  verifySessionToken,
} from "@/lib/access";
import { safeHref } from "@/lib/safe-url";
import { canTransition, transitionError } from "@/lib/services/transitions";
import { refreshCooldownRemainingMs, REFRESH_COOLDOWN_MS } from "@/lib/signals/cooldown";

describe("session tokens", () => {
  it("accepts a freshly signed token and rejects tampering", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const token = await createSessionToken("secret-a", Date.now(), id);
    expect(await verifySessionToken(token, "secret-a")).toBe(true);
    expect(await verifySessionToken(token, "secret-b")).toBe(false);
    const [sessionId, exp, sig] = token.split(".");
    expect(sessionId).toBe(id);
    expect(await verifySessionToken(`${sessionId}.${Number(exp) + 99999}.${sig}`, "secret-a")).toBe(false);
    expect(await verifySessionToken(`${exp}.${sig}`, "secret-a")).toBe(false);
    expect(await verifySessionToken(undefined, "secret-a")).toBe(false);
    expect(await verifySessionToken("garbage", "secret-a")).toBe(false);
  });

  it("expires sessions", async () => {
    const token = await createSessionToken("s", Date.now() - 1000 * 60 * 60 * 24 * 30);
    expect(await verifySessionToken(token, "s")).toBe(false);
  });

  it("compares passwords without length leaks and rejects wrong ones", async () => {
    expect(await passwordMatches("hunter2", "hunter2")).toBe(true);
    expect(await passwordMatches("hunter", "hunter2")).toBe(false);
  });

  it("parses cookies", () => {
    expect(readCookie("a=1; gm_session=abc.def; b=2", "gm_session")).toBe("abc.def");
    expect(readCookie(null, "gm_session")).toBeUndefined();
  });
});

describe("auth configuration (fail closed)", () => {
  it("requires BOTH password and secret", () => {
    expect(readAuthConfig({ APP_ACCESS_PASSWORD: "x" }).configured).toBe(false);
    expect(readAuthConfig({ AUTH_SECRET: "y" }).configured).toBe(false);
    expect(readAuthConfig({ APP_ACCESS_PASSWORD: "x", AUTH_SECRET: "y" }).configured).toBe(true);
  });

  it("is only open in unconfigured local development", () => {
    expect(isOpenDevMode({ NODE_ENV: "development" })).toBe(true);
    expect(isOpenDevMode({ NODE_ENV: "production" })).toBe(false);
    expect(isOpenDevMode({ NODE_ENV: "development", VERCEL: "1" })).toBe(false);
    expect(isOpenDevMode({ NODE_ENV: "development", APP_ACCESS_PASSWORD: "x", AUTH_SECRET: "y" })).toBe(false);
  });
});

describe("lead status transitions", () => {
  it("allows the happy path", () => {
    expect(canTransition("approve", "needs_review")).toBe(true);
    expect(canTransition("push_hubspot", "approved")).toBe(true);
    expect(canTransition("reject", "needs_review")).toBe(true);
  });

  it("never lets a rejected lead reach HubSpot without re-approval", () => {
    expect(canTransition("push_hubspot", "rejected")).toBe(false);
    expect(transitionError("push_hubspot", "rejected")).toMatch(/Re-approve/);
    expect(canTransition("approve", "rejected")).toBe(true); // explicit reconsideration
  });

  it("freezes synced leads and blocks unreviewed ones", () => {
    expect(canTransition("approve", "hubspot_synced")).toBe(false);
    expect(canTransition("reject", "hubspot_synced")).toBe(false);
    expect(canTransition("approve", "discovered")).toBe(false);
    expect(canTransition("approve", "enriching")).toBe(false);
    expect(canTransition("push_hubspot", "needs_review")).toBe(false);
  });
});

describe("safeHref", () => {
  it("only allows http(s)", () => {
    expect(safeHref("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(safeHref("http://example.com")).toBe("http://example.com/");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,<script>")).toBeNull();
    expect(safeHref("not a url")).toBeNull();
    expect(safeHref(null)).toBeNull();
  });
});

describe("refresh cooldown", () => {
  it("blocks repeat refreshes inside the window", () => {
    const now = Date.now();
    expect(refreshCooldownRemainingMs(undefined, now)).toBe(0);
    expect(refreshCooldownRemainingMs(new Date(now - 60_000).toISOString(), now)).toBeGreaterThan(0);
    expect(refreshCooldownRemainingMs(new Date(now - REFRESH_COOLDOWN_MS - 1).toISOString(), now)).toBe(0);
  });
});
