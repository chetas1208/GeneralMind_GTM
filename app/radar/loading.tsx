import { Loader2 } from "lucide-react";

export default function RadarLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin text-primary" />
        <span>Loading Radar intelligence…</span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-6 w-24 rounded bg-card/60" />
          <div className="mt-1 h-4 w-80 rounded bg-card/40" />
        </div>
        <div className="h-8 w-44 rounded-lg bg-card/30" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="h-20 rounded-xl border border-border/60 bg-card/30" />
        <div className="h-20 rounded-xl border border-border/60 bg-card/30" />
        <div className="h-20 rounded-xl border border-border/60 bg-card/30" />
        <div className="h-20 rounded-xl border border-border/60 bg-card/30" />
      </div>
      <div className="h-56 rounded-xl border border-border/60 bg-card/30" />
    </div>
  );
}
