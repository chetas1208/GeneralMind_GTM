import type { GraphDelta, GraphViewModel, IntelligenceGraphEdge, IntelligenceGraphNode } from "./types";

function nodeKey(n: IntelligenceGraphNode): string {
  return JSON.stringify({ label: n.label, subtitle: n.subtitle, score: n.score, confidence: n.confidence, status: n.status });
}

function edgeKey(e: IntelligenceGraphEdge): string {
  return JSON.stringify({
    type: e.type,
    label: e.label,
    confidence: e.confidence,
    verification: e.verification,
    animated: e.animated,
  });
}

/** Incremental diff for live sourcing polls — preserves client layout/selection. */
export function diffGraphs(previous: GraphViewModel, next: GraphViewModel): GraphDelta {
  const prevNodes = new Map(previous.nodes.map((n) => [n.id, n]));
  const nextNodes = new Map(next.nodes.map((n) => [n.id, n]));
  const prevEdges = new Map(previous.edges.map((e) => [e.id, e]));
  const nextEdges = new Map(next.edges.map((e) => [e.id, e]));

  const addedNodes: IntelligenceGraphNode[] = [];
  const updatedNodes: IntelligenceGraphNode[] = [];
  const removedNodeIds: string[] = [];
  const addedEdges: IntelligenceGraphEdge[] = [];
  const updatedEdges: IntelligenceGraphEdge[] = [];
  const removedEdgeIds: string[] = [];

  for (const [id, n] of nextNodes) {
    if (!prevNodes.has(id)) addedNodes.push(n);
    else if (nodeKey(prevNodes.get(id)!) !== nodeKey(n)) updatedNodes.push(n);
  }
  for (const id of prevNodes.keys()) if (!nextNodes.has(id)) removedNodeIds.push(id);

  for (const [id, e] of nextEdges) {
    if (!prevEdges.has(id)) addedEdges.push(e);
    else if (edgeKey(prevEdges.get(id)!) !== edgeKey(e)) updatedEdges.push(e);
  }
  for (const id of prevEdges.keys()) if (!nextEdges.has(id)) removedEdgeIds.push(id);

  return {
    addedNodes,
    updatedNodes,
    removedNodeIds,
    addedEdges,
    updatedEdges,
    removedEdgeIds,
    generatedAt: next.generatedAt,
  };
}
