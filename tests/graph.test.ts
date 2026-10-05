import { describe, expect, it } from "vitest";
import { applyGraphFilters } from "@/lib/graph/filters";
import { diffGraphs } from "@/lib/graph/delta";
import { computeTracePaths } from "@/lib/graph/trace";
import {
  attendanceVerification,
  evidenceSourceIsVerified,
  associationVerification,
} from "@/lib/graph/provenance";
import { GraphAccumulator, edgeId, nodeId, dedupeNodes } from "@/lib/graph/transforms";
import type { GraphViewModel } from "@/lib/graph/types";

describe("graph transforms", () => {
  it("dedupes nodes and builds stable edge ids", () => {
    const acc = new GraphAccumulator();
    acc.addNode({ id: nodeId("company", "a"), type: "company", label: "Acme" });
    acc.addNode({ id: nodeId("company", "a"), type: "company", label: "Acme Corp" });
    expect(acc.snapshot().nodes).toHaveLength(1);
    expect(acc.snapshot().nodes[0].label).toBe("Acme Corp");
    expect(edgeId("employed_by", "p:1", "c:1")).toBe("employed_by|p:1|c:1");
    expect(dedupeNodes([{ id: "a", type: "person", label: "x" }, { id: "a", type: "person", label: "y" }])).toHaveLength(1);
  });
});

describe("provenance", () => {
  it("classifies evidence and attendance", () => {
    expect(evidenceSourceIsVerified("official_speaker")).toBe(true);
    expect(evidenceSourceIsVerified("inference")).toBe(false);
    expect(attendanceVerification("official_speaker", 90)).toBe("verified");
    expect(attendanceVerification("inferred", 40)).toBe("inferred");
    expect(associationVerification("exhibitor", 85)).toBe("verified");
  });
});

describe("trace", () => {
  it("walks backward from opportunity", () => {
    const model: GraphViewModel = {
      scope: "opportunity",
      nodes: [
        { id: "evidence:e1", type: "evidence", label: "ev" },
        { id: "opportunity:o1", type: "opportunity", label: "opp" },
        { id: "person:p1", type: "person", label: "person" },
      ],
      edges: [
        {
          id: "1",
          source: "evidence:e1",
          target: "opportunity:o1",
          type: "evidence_for",
          verification: "verified",
        },
        {
          id: "2",
          source: "person:p1",
          target: "opportunity:o1",
          type: "supports_opportunity",
          verification: "inferred",
        },
      ],
      generatedAt: new Date().toISOString(),
      stats: { nodeCount: 3, edgeCount: 2 },
    };
    const t = computeTracePaths(model, "opportunity:o1");
    expect(t.nodeIds.has("evidence:e1")).toBe(true);
    expect(t.nodeIds.has("person:p1")).toBe(true);
  });
});

describe("graph delta", () => {
  it("detects added nodes without full reload", () => {
    const base: GraphViewModel = {
      scope: "event",
      nodes: [{ id: "event:1", type: "event", label: "E" }],
      edges: [],
      generatedAt: "t0",
      stats: { nodeCount: 1, edgeCount: 0 },
    };
    const next: GraphViewModel = {
      ...base,
      nodes: [...base.nodes, { id: "company:1", type: "company", label: "Acme" }],
      stats: { nodeCount: 2, edgeCount: 0 },
      generatedAt: "t1",
    };
    const d = diffGraphs(base, next);
    expect(d.addedNodes).toHaveLength(1);
    expect(d.removedNodeIds).toHaveLength(0);
  });
});

describe("filters", () => {
  it("hides inferred edges in verified-only mode", () => {
    const model: GraphViewModel = {
      scope: "market",
      nodes: [
        { id: "a", type: "company", label: "A" },
        { id: "b", type: "person", label: "B" },
      ],
      edges: [
        { id: "e1", source: "b", target: "a", type: "employed_by", verification: "inferred" },
        { id: "e2", source: "a", target: "b", type: "associated_with", verification: "verified", confidence: 90 },
      ],
      generatedAt: "t",
      stats: { nodeCount: 2, edgeCount: 2 },
    };
    const out = applyGraphFilters(model, { verification: "verified" });
    expect(out.edges).toHaveLength(1);
    expect(out.edges[0].verification).toBe("verified");
  });
});
