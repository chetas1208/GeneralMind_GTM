"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { GraphView } from "@/components/graph/graph-view-lazy";
import { cn } from "@/lib/utils";

export function RadarViewTabs({ table, activeRunId }: { table: React.ReactNode; activeRunId?: string }) {
  const sp = useSearchParams();
  const view = sp.get("view") === "graph" ? "graph" : "table";
  const scope = (sp.get("scope") as "market" | "event" | "company" | "opportunity") ?? "market";
  const entityId = sp.get("entityId") ?? undefined;
  const trace = sp.get("trace") === "1";
  const runId = sp.get("runId") ?? activeRunId;

  const base = "/radar";
  const q = (v: string, extra?: Record<string, string>) => {
    const p = new URLSearchParams();
    if (v === "graph") p.set("view", "graph");
    if (extra) for (const [k, val] of Object.entries(extra)) p.set(k, val);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <Link
          href={q("table")}
          className={cn("rounded-md px-2.5 py-1", view === "table" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          Table
        </Link>
        <Link
          href={q("graph", { scope: "market" })}
          className={cn("rounded-md px-2.5 py-1", view === "graph" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          Graph
        </Link>
        {view === "graph" && trace && (
          <span className="rounded-md border border-sky-400/30 px-2 py-0.5 text-sky-400/90">Trace</span>
        )}
      </div>
      {view === "graph" ? (
        <GraphView scope={scope === "event" || scope === "company" || scope === "opportunity" ? scope : "market"} entityId={entityId} runId={runId} trace={trace} minHeight={480} />
      ) : (
        table
      )}
    </div>
  );
}
