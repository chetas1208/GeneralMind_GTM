import { describe, expect, it } from "vitest";
import { pickNextAction } from "@/lib/analytics/next-action";

describe("next best action", () => {
  it("prefers the highest-priority unreviewed opportunity", () => {
    const action = pickNextAction(
      [{ id: "a", priorityScore: 70, personName: "A", companyName: null, title: null }, { id: "b", priorityScore: 96, personName: "Sarah", companyName: "Acme", title: "VP" }],
      [],
    );
    expect(action.href).toBe("/leads?lead=b");
    expect(action.title).toContain("Sarah");
  });

  it("falls back to an unresearched event", () => {
    const action = pickNextAction([], [{ id: "e", name: "ProcureCon", leadCount: 0, status: "selected" }]);
    expect(action.href).toBe("/events/e");
  });
});
