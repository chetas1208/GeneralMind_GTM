import type { GraphViewModel, IntelligenceNodeType } from "./types";

const RANK: IntelligenceNodeType[] = ["opportunity", "person", "company", "event", "workflow", "signal", "evidence"];

/** Keep a short provenance chain. Evidence and weak signals drop first. */
export function pruneGraph(model: GraphViewModel, maxNodes = 15): GraphViewModel {
  if (model.nodes.length <= maxNodes) return model;
  const ranked = [...model.nodes].sort((a, b) => {
    const ra = RANK.indexOf(a.type);
    const rb = RANK.indexOf(b.type);
    if (ra !== rb) return ra - rb;
    return (b.score ?? b.confidence ?? 0) - (a.score ?? a.confidence ?? 0);
  });
  const keep = new Set<string>();
  if (model.rootId) keep.add(model.rootId);
  for (const n of ranked) {
    if (keep.size >= maxNodes) break;
    keep.add(n.id);
  }
  const nodes = model.nodes.filter((n) => keep.has(n.id));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = model.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  return { ...model, nodes, edges, stats: { nodeCount: nodes.length, edgeCount: edges.length } };
}
