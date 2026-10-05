import type { IntelligenceEdgeType, IntelligenceGraphEdge, IntelligenceGraphNode, IntelligenceNodeType } from "./types";

export function nodeId(type: IntelligenceNodeType, entityId: string): string {
  return `${type}:${entityId}`;
}

export function parseNodeId(id: string): { type: IntelligenceNodeType; entityId: string } | null {
  const i = id.indexOf(":");
  if (i <= 0) return null;
  return { type: id.slice(0, i) as IntelligenceNodeType, entityId: id.slice(i + 1) };
}

export function workflowNodeId(companyId: string, workflowKey: string): string {
  return nodeId("workflow", `${companyId}:${workflowKey}`);
}

export function edgeId(type: IntelligenceEdgeType, source: string, target: string): string {
  return `${type}|${source}|${target}`;
}

export class GraphAccumulator {
  private nodes = new Map<string, IntelligenceGraphNode>();
  private edges = new Map<string, IntelligenceGraphEdge>();

  addNode(node: IntelligenceGraphNode): void {
    const existing = this.nodes.get(node.id);
    if (!existing) {
      this.nodes.set(node.id, node);
      return;
    }
    this.nodes.set(node.id, {
      ...existing,
      ...node,
      metadata: { ...existing.metadata, ...node.metadata },
    });
  }

  addEdge(edge: IntelligenceGraphEdge): void {
    const existing = this.edges.get(edge.id);
    if (!existing) {
      this.edges.set(edge.id, edge);
      return;
    }
    this.edges.set(edge.id, {
      ...existing,
      ...edge,
      evidenceIds: [...new Set([...(existing.evidenceIds ?? []), ...(edge.evidenceIds ?? [])])],
    });
  }

  hasNode(id: string): boolean {
    return this.nodes.has(id);
  }

  snapshot(): { nodes: IntelligenceGraphNode[]; edges: IntelligenceGraphEdge[] } {
    return { nodes: [...this.nodes.values()], edges: [...this.edges.values()] };
  }
}

export function dedupeNodes(nodes: IntelligenceGraphNode[]): IntelligenceGraphNode[] {
  const m = new Map<string, IntelligenceGraphNode>();
  for (const n of nodes) m.set(n.id, n);
  return [...m.values()];
}

export function dedupeEdges(edges: IntelligenceGraphEdge[]): IntelligenceGraphEdge[] {
  const m = new Map<string, IntelligenceGraphEdge>();
  for (const e of edges) m.set(e.id, e);
  return [...m.values()];
}
