/** Renderer-independent intelligence graph (Neon → builder → React Flow / future Sigma). */

export type IntelligenceNodeType =
  | "signal"
  | "event"
  | "company"
  | "person"
  | "workflow"
  | "opportunity"
  | "evidence";

export type IntelligenceEdgeType =
  | "attending"
  | "speaking_at"
  | "exhibiting_at"
  | "sponsoring"
  | "employed_by"
  | "evidence_for"
  | "signal_for"
  | "suggests_workflow"
  | "supports_opportunity"
  | "associated_with"
  | "approved_as"
  | "synced_to";

export type GraphScope = "opportunity" | "event" | "company" | "market";

export type EdgeVerification = "verified" | "inferred";

export type IntelligenceGraphNode = {
  id: string;
  type: IntelligenceNodeType;
  label: string;
  subtitle?: string;
  confidence?: number;
  score?: number;
  status?: string;
  /** Stable entity UUID for deep links (without type prefix). */
  entityId?: string;
  href?: string;
  metadata?: Record<string, unknown>;
};

export type IntelligenceGraphEdge = {
  id: string;
  source: string;
  target: string;
  type: IntelligenceEdgeType;
  label?: string;
  confidence?: number;
  verification: EdgeVerification;
  explanation?: string;
  evidenceIds?: string[];
  animated?: boolean;
  metadata?: Record<string, unknown>;
};

/** Canonical view model consumed by any renderer. */
export type GraphViewModel = {
  scope: GraphScope;
  rootId?: string;
  nodes: IntelligenceGraphNode[];
  edges: IntelligenceGraphEdge[];
  generatedAt: string;
  stats: { nodeCount: number; edgeCount: number };
};

export type GraphDelta = {
  addedNodes: IntelligenceGraphNode[];
  updatedNodes: IntelligenceGraphNode[];
  removedNodeIds: string[];
  addedEdges: IntelligenceGraphEdge[];
  updatedEdges: IntelligenceGraphEdge[];
  removedEdgeIds: string[];
  generatedAt: string;
};

export type GraphQueryParams = {
  scope: GraphScope;
  entityId?: string;
  runId?: string;
  depth?: number;
  minConfidence?: number;
  minScore?: number;
  nodeTypes?: IntelligenceNodeType[];
};

export type GraphLayoutPosition = { x: number; y: number };

export type LayoutedGraph = GraphViewModel & {
  positions: Record<string, GraphLayoutPosition>;
};
