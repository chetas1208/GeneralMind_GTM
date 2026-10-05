"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";

export type IntelligenceNodeData = {
  nodeType: string;
  label: string;
  subtitle?: string;
  score?: number;
  confidence?: number;
  status?: string;
  dimmed?: boolean;
  selected?: boolean;
};

function IntelligenceNodeComponent({ data, selected }: NodeProps) {
  const d = data as IntelligenceNodeData;
  const t = d.nodeType;
  const border =
    t === "opportunity"
      ? "border-sky-400/60 shadow-[0_8px_24px_-8px_rgba(56,189,248,0.35)]"
      : t === "company"
        ? "border-border/80"
        : t === "event"
          ? "border-violet-400/40"
          : t === "signal"
            ? "border-amber-400/35 rotate-0"
            : t === "evidence"
              ? "border-border/50 opacity-90"
              : "border-border/60";

  return (
    <div
      className={cn(
        "rounded-lg border bg-card/90 px-3 py-2 text-left backdrop-blur-sm transition-shadow",
        t === "signal" && "rounded-full px-2.5 py-1.5 text-[11px]",
        t === "workflow" && "rounded-md border-dashed text-[11px]",
        t === "opportunity" && "rounded-xl px-3.5 py-2.5",
        border,
        selected && "ring-2 ring-sky-400/50 scale-[1.02]",
        d.dimmed && "opacity-35",
      )}
    >
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0 !bg-muted-foreground/40" />
      {t === "opportunity" && <p className="text-[9px] font-semibold uppercase tracking-widest text-sky-400/90">Opportunity</p>}
      <p className={cn("font-medium leading-tight", t === "signal" || t === "evidence" ? "text-[11px]" : "text-[13px]")}>{d.label}</p>
      {d.subtitle && <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{d.subtitle}</p>}
      {(d.score != null || d.confidence != null) && (
        <p className="mt-1 font-mono text-[10px] tabular-nums text-muted-foreground">
          {d.score != null && <>Fit {d.score}</>}
          {d.score != null && d.confidence != null && " · "}
          {d.confidence != null && <>Pri {d.confidence}</>}
        </p>
      )}
      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-0 !bg-muted-foreground/40" />
    </div>
  );
}

export const IntelligenceNode = memo(IntelligenceNodeComponent);
