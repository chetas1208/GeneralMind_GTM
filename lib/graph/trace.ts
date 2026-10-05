import type { GraphViewModel, IntelligenceGraphEdge } from "./types";

/** Highlight nodes/edges on paths backward from an opportunity (provenance trace). */
export function computeTracePaths(model: GraphViewModel, rootNodeId: string): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const nodeIds = new Set<string>([rootNodeId]);
  const edgeIds = new Set<string>();
  const incoming = new Map<string, IntelligenceGraphEdge[]>();
  for (const e of model.edges) {
    const list = incoming.get(e.target) ?? [];
    list.push(e);
    incoming.set(e.target, list);
  }

  const queue = [rootNodeId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of incoming.get(cur) ?? []) {
      edgeIds.add(e.id);
      if (!nodeIds.has(e.source)) {
        nodeIds.add(e.source);
        queue.push(e.source);
      }
    }
  }
  return { nodeIds, edgeIds };
}
