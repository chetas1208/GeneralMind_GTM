import { describe, expect, it } from "vitest";
import { pruneGraph } from "@/lib/graph/prune";
import type { GraphViewModel } from "@/lib/graph/types";

describe("opportunity trace budget", () => {
  it("keeps at most 15 nodes and prefers the opportunity", () => {
    const nodes = [
      { id: "opportunity:1", type: "opportunity" as const, label: "Opp" },
      ...Array.from({ length: 20 }, (_, i) => ({ id: `evidence:${i}`, type: "evidence" as const, label: `e${i}` })),
    ];
    const model: GraphViewModel = {
      scope: "opportunity",
      rootId: "opportunity:1",
      nodes,
      edges: nodes.slice(1).map((n) => ({
        id: `e-${n.id}`,
        source: n.id,
        target: "opportunity:1",
        type: "evidence_for" as const,
        verification: "inferred" as const,
      })),
      generatedAt: new Date().toISOString(),
      stats: { nodeCount: nodes.length, edgeCount: 20 },
    };
    const pruned = pruneGraph(model, 15);
    expect(pruned.nodes.length).toBeLessThanOrEqual(15);
    expect(pruned.nodes.some((n) => n.id === "opportunity:1")).toBe(true);
    expect(pruned.edges.every((e) => pruned.nodes.some((n) => n.id === e.source) && pruned.nodes.some((n) => n.id === e.target))).toBe(true);
  });
});