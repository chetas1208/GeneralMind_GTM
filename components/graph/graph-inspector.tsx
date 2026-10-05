"use client";

import Link from "next/link";
import type { IntelligenceGraphEdge, IntelligenceGraphNode } from "@/lib/graph/types";

export function GraphInspector({
  node,
  edge,
  onClose,
}: {
  node: IntelligenceGraphNode | null;
  edge: IntelligenceGraphEdge | null;
  onClose: () => void;
}) {
  if (!node && !edge) return null;

  return (
    <aside className="absolute bottom-3 right-3 z-10 max-w-sm rounded-xl border border-border/70 bg-card/95 p-3 text-[12px] shadow-lg backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Inspector</p>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          Close
        </button>
      </div>
      {node && (
        <div className="space-y-1">
          <p className="font-medium">{node.label}</p>
          {node.subtitle && <p className="text-muted-foreground">{node.subtitle}</p>}
          {node.href && (
            <Link href={node.href} className="text-sky-400 hover:underline">
              Open record →
            </Link>
          )}
        </div>
      )}
      {edge && (
        <div className="space-y-1">
          <p className="font-medium">{edge.label ?? edge.type.replace(/_/g, " ")}</p>
          <p className="text-muted-foreground">
            {edge.verification === "verified" ? "Direct or official relationship" : "Inferred relationship"}
          </p>
          {edge.explanation && <p className="text-muted-foreground">{edge.explanation}</p>}
          {edge.confidence != null && (
            <details className="text-muted-foreground">
              <summary className="cursor-pointer">Details</summary>
              <p className="mt-1">Internal ranking aid: {(edge.confidence / 100).toFixed(2)}</p>
            </details>
          )}
        </div>
      )}
    </aside>
  );
}
