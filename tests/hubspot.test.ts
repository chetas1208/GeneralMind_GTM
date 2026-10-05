import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncLeadToHubspot } from "@/lib/integrations/hubspot/sync";

type Call = { url: string; method: string; body?: unknown };

/** Minimal in-memory HubSpot at the HTTP boundary. */
function mockHubspot(opts: { existingCompany?: string; existingContact?: string; rejectCustomProps?: boolean } = {}) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

    if (url.endsWith("/crm/v3/objects/companies/search")) return json({ results: opts.existingCompany ? [{ id: opts.existingCompany, properties: {} }] : [] });
    if (url.endsWith("/crm/v3/objects/contacts/search")) return json({ results: opts.existingContact ? [{ id: opts.existingContact, properties: {} }] : [] });
    if (url.endsWith("/crm/v3/objects/companies") && method === "POST") return json({ id: "C-new", properties: {} }, 201);
    if (/\/crm\/v3\/objects\/companies\/[^/]+$/.test(url) && method === "PATCH") return json({ id: url.split("/").pop(), properties: {} });
    if (url.endsWith("/crm/v3/objects/contacts") && method === "POST") {
      if (opts.rejectCustomProps && Object.keys(body.properties).some((k) => k.startsWith("generalmind_"))) {
        return json({ status: "error", message: "Property values were not valid", category: "VALIDATION_ERROR", errors: [{ code: "PROPERTY_DOESNT_EXIST" }] }, 400);
      }
      return json({ id: "P-new", properties: {} }, 201);
    }
    if (/\/crm\/v3\/objects\/contacts\/[^/]+$/.test(url) && method === "PATCH") {
      if (opts.rejectCustomProps && Object.keys(body.properties).some((k) => k.startsWith("generalmind_"))) {
        return json({ message: "Property values were not valid", errors: [{ code: "PROPERTY_DOESNT_EXIST" }] }, 400);
      }
      return json({ id: url.split("/").pop(), properties: {} });
    }
    if (url.includes("/crm/v4/objects/contacts/") && url.includes("/associations/default/companies/") && method === "PUT") return json({ status: "COMPLETE" });
    return json({ message: `unmocked ${method} ${url}` }, 500);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

const lead = {
  company: { name: "Acme Industries", domain: "acme.com", employeeCount: 5000, country: "United States" },
  contact: { email: "Jane@Acme.com", firstName: "Jane", lastName: "Smith", jobTitle: "VP Supply Chain", companyName: "Acme Industries", extra: { generalmind_lead_score: "88" } },
};

describe("HubSpot sync (mocked HTTP boundary)", () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.unstubAllGlobals());

  it("creates company + contact and associates them", async () => {
    const calls = mockHubspot();
    const r = await syncLeadToHubspot(lead);
    expect(r).toMatchObject({ contactId: "P-new", companyId: "C-new", contactCreated: true, companyCreated: true, associated: true });
    expect(calls.some((c) => c.method === "PUT" && c.url.includes("/associations/default/companies/C-new"))).toBe(true);
    const create = calls.find((c) => c.url.endsWith("/contacts") && c.method === "POST");
    expect((create?.body as { properties: Record<string, string> }).properties.email).toBe("jane@acme.com");
  });

  it("is idempotent: reuses existing records instead of creating duplicates", async () => {
    const calls = mockHubspot({ existingCompany: "C-1", existingContact: "P-1" });
    const r = await syncLeadToHubspot(lead);
    expect(r).toMatchObject({ contactId: "P-1", companyId: "C-1", contactCreated: false, companyCreated: false });
    expect(calls.filter((c) => c.method === "POST" && !c.url.endsWith("/search"))).toHaveLength(0);
  });

  it("re-uses IDs from a previous sync on retry without searching", async () => {
    const calls = mockHubspot();
    const r = await syncLeadToHubspot({ ...lead, previous: { contactId: "P-9", companyId: "C-9" } });
    expect(r).toMatchObject({ contactId: "P-9", companyId: "C-9", contactCreated: false });
    expect(calls.some((c) => c.url.endsWith("/search"))).toBe(false);
  });

  it("drops custom properties instead of failing the whole sync", async () => {
    mockHubspot({ rejectCustomProps: true });
    const r = await syncLeadToHubspot(lead);
    expect(r.contactId).toBe("P-new");
    expect(r.usedExtraProperties).toBe(false);
  });
});

describe("HubSpot sync — contacts without an email", () => {
  afterEach(() => vi.unstubAllGlobals());
  const noEmail = { ...lead, contact: { ...lead.contact, email: null, linkedinUrl: "https://www.linkedin.com/in/jane-smith-123" } };
  const created = (calls: Call[]) => calls.find((c) => c.url.endsWith("/contacts") && c.method === "POST");
  const propsOf = (c?: Call) => (c?.body as { properties: Record<string, string> }).properties;

  it("sends the verified profile URL and never invents an email", async () => {
    const calls = mockHubspot();
    await syncLeadToHubspot(noEmail);
    const p = propsOf(created(calls));
    expect(p.hs_linkedin_url).toBe("https://www.linkedin.com/in/jane-smith-123");
    expect(p.email).toBeUndefined();
  });

  it("keeps the profile URL when the portal rejects the GeneralMind custom properties", async () => {
    const calls = mockHubspot({ rejectCustomProps: true });
    await syncLeadToHubspot(noEmail);
    const ok = calls.filter((c) => c.url.endsWith("/contacts") && c.method === "POST").at(-1);
    expect(propsOf(ok).hs_linkedin_url).toBeDefined();
    expect(Object.keys(propsOf(ok)).some((k) => k.startsWith("generalmind_"))).toBe(false);
  });

  it("refuses to send non-LinkedIn, non-https or non-profile URLs", async () => {
    for (const bad of ["http://www.linkedin.com/in/x", "https://evil.example/in/x", "https://www.linkedin.com/company/acme", "javascript:alert(1)"]) {
      const calls = mockHubspot();
      await syncLeadToHubspot({ ...noEmail, contact: { ...noEmail.contact, linkedinUrl: bad } });
      expect(propsOf(created(calls)).hs_linkedin_url, bad).toBeUndefined();
    }
  });
});
