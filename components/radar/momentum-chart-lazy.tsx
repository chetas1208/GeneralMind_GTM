"use client";

import dynamic from "next/dynamic";
import type { MomentumSeries } from "@/lib/analytics/types";

export const MomentumChart = dynamic(
  () => import("./momentum-chart").then((m) => m.MomentumChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-56 w-full rounded-xl border border-border/60 bg-card/30 animate-pulse flex items-center justify-center">
        <span className="text-xs text-muted-foreground">Loading momentum chart…</span>
      </div>
    ),
  },
) as React.ComponentType<{ series: MomentumSeries }>;
