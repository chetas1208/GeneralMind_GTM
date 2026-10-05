import type { GraphViewModel, IntelligenceGraphEdge, IntelligenceGraphNode, IntelligenceNodeType } from "./types";

export type GraphFilterState = {
  nodeTypes?: IntelligenceNodeType[];
  minConfidence?: number;
  verification?: "all" | "verified" | "strong";
  minScore?: number;
};

export function applyGraphFilters(model: GraphViewModel, filters: GraphFilterState): GraphViewModel {
  let nodes = model.nodes;
  let edges = model.edges;

  if (filters.nodeTypes?.length) {
    const allowed = new Set(filters.nodeTypes);
    nodes = nodes.filter((n) => allowed.has(n.type));
    const ids = new Set(nodes.map((n) => n.id));
    edges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  }

  if (filters.minScore != null) {
    nodes = nodes.filter((n) => n.type !== "opportunity" || (n.score ?? 0) >= filters.minScore!);
    const ids = new Set(nodes.map((n) => n.id));
    edges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  }

  if (filters.minConfidence != null) {
    edges = edges.filter((e) => (e.confidence ?? 50) >= filters.minConfidence!);
    const connected = edgeNodeIds(edges);
    nodes = nodes.filter((n) => connected.has(n.id) || n.type === "opportunity" || n.type === "event");
  }

  if (filters.verification === "verified") {
    edges = edges.filter((e) => e.verification === "verified");
    const connected = edgeNodeIds(edges);
    nodes = nodes.filter((n) => connected.has(n.id));
  } else if (filters.verification === "strong") {
    edges = edges.filter((e) => e.verification === "verified" || (e.confidence ?? 0) >= 75);
    const connected = edgeNodeIds(edges);
    nodes = nodes.filter((n) => connected.has(n.id));
  }

  return { ...model, nodes, edges, stats: { nodeCount: nodes.length, edgeCount: edges.length } };
}

function edgeNodeIds(edges: IntelligenceGraphEdge[]): Set<string> {
  const s = new Set<string>();
  for (const e of edges) {
    s.add(e.source);
    s.add(e.target);
  }
  return s;
}

export function dimUnrelated(
  model: GraphViewModel,
  focusNodeIds: Set<string>,
): { nodes: IntelligenceGraphNode[]; edges: IntelligenceGraphEdge[] } {
  const neighborhood = new Set(focusNodeIds);
  for (const e of model.edges) {
    if (focusNodeIds.has(e.source) || focusNodeIds.has(e.target)) {
      neighborhood.add(e.source);
      neighborhood.add(e.target);
    }
  }
  return {
    nodes: model.nodes.map((n) => ({ ...n, metadata: { ...n.metadata, dimmed: !neighborhood.has(n.id) } })),
    edges: model.edges.map((e) => ({
      ...e,
      metadata: { dimmed: !(neighborhood.has(e.source) && neighborhood.has(e.target)) },
    })) as IntelligenceGraphEdge[],
  };
}
