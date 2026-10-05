import dagre from "@dagrejs/dagre";
import type { GraphLayoutPosition, GraphViewModel, LayoutedGraph } from "./types";

const NODE_SIZE: Record<string, { width: number; height: number }> = {
  event: { width: 220, height: 72 },
  company: { width: 200, height: 68 },
  person: { width: 180, height: 64 },
  opportunity: { width: 200, height: 76 },
  signal: { width: 140, height: 48 },
  workflow: { width: 150, height: 44 },
  evidence: { width: 160, height: 44 },
};

/** Deterministic layered layout (signals/evidence → events → companies → people → opportunities). */
export function layoutGraph(model: GraphViewModel, direction: "TB" | "LR" = "TB"): LayoutedGraph {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 48, ranksep: 72, marginx: 24, marginy: 24 });

  for (const n of model.nodes) {
    const size = NODE_SIZE[n.type] ?? { width: 160, height: 52 };
    g.setNode(n.id, size);
  }
  for (const e of model.edges) g.setEdge(e.source, e.target);

  dagre.layout(g);

  const positions: Record<string, GraphLayoutPosition> = {};
  for (const n of model.nodes) {
    const p = g.node(n.id);
    if (!p) continue;
    positions[n.id] = { x: p.x - p.width / 2, y: p.y - p.height / 2 };
  }

  return { ...model, positions };
}
