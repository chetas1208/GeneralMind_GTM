"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from "@xyflow/react";
import { IntelligenceEdge } from "./intelligence-edge";
import { IntelligenceNode } from "./intelligence-node";
import { GraphInspector } from "./graph-inspector";
import { GraphLegend } from "./graph-legend";
import { applyGraphFilters, type GraphFilterState } from "@/lib/graph/filters";
import { computeTracePaths } from "@/lib/graph/trace";
import type { GraphViewModel, IntelligenceGraphEdge, IntelligenceGraphNode, LayoutedGraph } from "@/lib/graph/types";
import { cn } from "@/lib/utils";

const nodeTypes = { intelligence: IntelligenceNode };
const edgeTypes = { intelligence: IntelligenceEdge };

function toFlowNodes(model: LayoutedGraph, traceIds?: Set<string>): Node[] {
  return model.nodes.map((n) => ({
    id: n.id,
    type: "intelligence",
    position: model.positions[n.id] ?? { x: 0, y: 0 },
    data: {
      nodeType: n.type,
      label: n.label,
      subtitle: n.subtitle,
      score: n.score,
      confidence: n.confidence,
      status: n.status,
      dimmed: traceIds ? !traceIds.has(n.id) : Boolean(n.metadata?.dimmed),
    },
  }));
}

function toFlowEdges(model: GraphViewModel, traceIds?: Set<string>): Edge[] {
  return model.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: "intelligence",
    animated: e.animated,
    data: {
      verification: e.verification,
      confidence: e.confidence,
      label: e.label,
      explanation: e.explanation,
      dimmed: traceIds ? !traceIds.has(e.id) : Boolean(e.metadata?.dimmed),
    },
  }));
}

export type GraphViewProps = {
  scope: "opportunity" | "event" | "company" | "market";
  entityId?: string;
  runId?: string;
  trace?: boolean;
  className?: string;
  minHeight?: number;
};

export function GraphView(props: GraphViewProps) {
  const key = `${props.scope}-${props.entityId ?? ""}-${props.runId ?? ""}`;
  return (
    <ReactFlowProvider>
      <GraphViewCanvas key={key} {...props} />
    </ReactFlowProvider>
  );
}

function GraphViewCanvas({ scope, entityId, runId, trace, className, minHeight = 420 }: GraphViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<LayoutedGraph | null>(null);
  const [selectedNode, setSelectedNode] = useState<IntelligenceGraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<IntelligenceGraphEdge | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [verification, setVerification] = useState<GraphFilterState["verification"]>("all");
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const snapshotRef = useRef<GraphViewModel | null>(null);

  const mergeLayout = useCallback((prev: LayoutedGraph | null, next: LayoutedGraph): LayoutedGraph => {
    if (!prev) return next;
    const positions = { ...next.positions };
    for (const id of Object.keys(prev.positions)) {
      if (positions[id]) positions[id] = prev.positions[id];
    }
    return { ...next, positions };
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ scope });
    if (entityId) params.set("entityId", entityId);
    if (runId) params.set("runId", runId);
    const res = await fetch(`/api/graph?${params}`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Load failed (${res.status})`);
    return (await res.json()) as LayoutedGraph;
  }, [scope, entityId, runId]);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => {
        if (cancelled) return;
        setRaw(data);
        snapshotRef.current = data;
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load graph");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (!runId || !snapshotRef.current) return;
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/graph/delta", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            scope,
            entityId,
            runId,
            previous: snapshotRef.current,
          }),
        });
        if (!res.ok) return;
        const { snapshot } = (await res.json()) as { snapshot: LayoutedGraph };
        if (stop) return;
        setRaw((prev) => {
          const merged = mergeLayout(prev, snapshot);
          snapshotRef.current = merged;
          return merged;
        });
      } catch {
        /* keep existing graph */
      }
    };
    const id = setInterval(poll, 3000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [runId, scope, entityId, mergeLayout]);

  const displayModel = useMemo(() => {
    if (!raw) return null;
    const filtered = applyGraphFilters(raw, { verification });
    return { ...raw, ...filtered };
  }, [raw, verification]);

  const traceSets = useMemo(() => {
    if (!displayModel || !trace || !displayModel.rootId) return undefined;
    return computeTracePaths(displayModel, displayModel.rootId);
  }, [displayModel, trace]);

  useEffect(() => {
    if (!displayModel) return;
    setNodes(toFlowNodes(displayModel, traceSets?.nodeIds));
    setEdges(toFlowEdges(displayModel, traceSets?.edgeIds));
  }, [displayModel, traceSets, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      const n = displayModel?.nodes.find((x) => x.id === node.id) ?? null;
      setSelectedNode(n);
      setSelectedEdge(null);
    },
    [displayModel],
  );

  const onEdgeClick = useCallback(
    (_: unknown, edge: Edge) => {
      const e = displayModel?.edges.find((x) => x.id === edge.id) ?? null;
      setSelectedEdge(e);
      setSelectedNode(null);
    },
    [displayModel],
  );

  if (loading) {
    return (
      <div className={className} style={{ minHeight }}>
        <p className="p-6 text-sm text-muted-foreground">Loading intelligence graph…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={className} style={{ minHeight }}>
        <p className="p-6 text-sm text-destructive">{error}</p>
        <button
          type="button"
          className="ml-6 text-xs text-sky-400"
          onClick={() => {
            setLoading(true);
            load()
              .then((data) => {
                setRaw((prev) => mergeLayout(prev, data));
                snapshotRef.current = data;
                setError(null);
              })
              .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
              .finally(() => setLoading(false));
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!raw?.nodes.length) {
    return (
      <div className={className} style={{ minHeight }}>
        <p className="p-6 text-sm text-muted-foreground">No intelligence relationships yet. Source an event to begin building its graph.</p>
      </div>
    );
  }

  const showMinimap = raw.nodes.length > 18;

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-border/60 bg-background/40 ${className ?? ""}`}
      style={{ height: minHeight, minHeight }}
    >
      <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
        {trace && raw.rootId && (
          <p className="rounded-md bg-card/90 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur-sm">
            Trace — provenance path highlighted
          </p>
        )}
        <div className="flex rounded-md border border-border/60 bg-card/90 p-0.5 text-[10px] backdrop-blur-sm">
          {(["all", "strong", "verified"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={cn(
                "rounded px-2 py-0.5 capitalize",
                verification === v ? "bg-accent text-foreground" : "text-muted-foreground",
              )}
              onClick={() => setVerification(v)}
            >
              {v === "all" ? "All" : v}
            </button>
          ))}
        </div>
      </div>
      <ReactFlow
        className="h-full w-full"
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={1.4}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} className="opacity-40" />
        <Controls showInteractive={false} />
        {showMinimap && <MiniMap pannable zoomable className="!bg-card/80" />}
      </ReactFlow>
      <GraphLegend collapsed={!legendOpen} onToggle={() => setLegendOpen((v) => !v)} />
      <GraphInspector node={selectedNode} edge={selectedEdge} onClose={() => { setSelectedNode(null); setSelectedEdge(null); }} />
    </div>
  );
}
