"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { InfoHint } from "@/components/ui/info-hint";
import type { MomentumPoint, MomentumSeries } from "@/lib/analytics/types";
import { cn } from "@/lib/utils";

const METRICS = [
  { key: "momentum", label: "Momentum" },
  { key: "quality", label: "Quality" },
  { key: "volume", label: "Volume" },
] as const;

export function MomentumChart({ series }: { series: MomentumSeries }) {
  const [metric, setMetric] = useState<(typeof METRICS)[number]["key"]>("momentum");
  const delta = series.deltaPct;

  return (
    <section data-tour="momentum" className="rounded-xl border border-border/60 bg-card/40 p-4 shadow-[0_12px_40px_-24px_rgba(0,0,0,0.45)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold">Opportunity momentum</h2>
          <InfoHint label="About momentum">
            Measures the strength of active opportunities using priority, evidence and freshness.
          </InfoHint>
        </div>
        <div className="flex gap-1 text-[11px]">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              className={cn("rounded-md px-2 py-1", metric === m.key ? "bg-accent text-foreground" : "text-muted-foreground")}
              onClick={() => setMetric(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} minTickGap={24} />
            <YAxis tick={{ fontSize: 10 }} width={32} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const p = payload[0].payload as MomentumPoint;
                return (
                  <div className="rounded-md border bg-card px-2 py-1.5 text-[11px] shadow-sm">
                    <p className="font-medium">{p.date}</p>
                    <p>Momentum {p.momentum}</p>
                    <p className="text-muted-foreground">{p.driver}</p>
                  </div>
                );
              }}
            />
            <Line type="monotone" dataKey={metric} stroke="var(--foreground)" strokeWidth={1.75} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {delta == null ? "Not enough prior history to compare periods." : `${delta > 0 ? "+" : ""}${delta}% vs previous ${series.range} days`}
        {series.historyNote ? ` · ${series.historyNote}` : ""}
      </p>
    </section>
  );
}
