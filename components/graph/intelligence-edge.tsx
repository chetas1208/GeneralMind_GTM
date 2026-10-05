"use client";

import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";

export type IntelligenceEdgeData = {
  verification: "verified" | "inferred";
  confidence?: number;
  label?: string;
  explanation?: string;
  dimmed?: boolean;
};

function IntelligenceEdgeComponent(props: EdgeProps) {
  const d = (props.data ?? {}) as IntelligenceEdgeData;
  const [path, labelX, labelY] = getBezierPath(props);
  const faint = (d.confidence ?? 50) < 40;
  const stroke =
    d.verification === "inferred" || faint ? "var(--muted-foreground)" : "var(--foreground)";
  const opacity = d.dimmed ? 0.15 : d.verification === "inferred" ? 0.45 : faint ? 0.35 : 0.65;

  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={props.markerEnd}
        style={{
          stroke,
          strokeWidth: d.verification === "verified" ? 1.5 : 1,
          strokeDasharray: d.verification === "inferred" ? "6 4" : undefined,
          opacity,
        }}
        className={props.animated ? "animate-pulse" : undefined}
      />
      {d.label && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
            className="pointer-events-none rounded bg-background/80 px-1 text-[9px] text-muted-foreground"
          >
            {d.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const IntelligenceEdge = memo(IntelligenceEdgeComponent);
