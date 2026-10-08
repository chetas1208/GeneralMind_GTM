import { Loader2 } from "lucide-react";

export default function PipelineLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin text-primary" />
        <span>Loading pipeline decisions…</span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="h-6 w-24 rounded bg-card/60" />
          <div className="mt-1 h-4 w-72 rounded bg-card/40" />
        </div>
        <div className="h-8 w-32 rounded-lg bg-card/30" />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="h-64 rounded-xl border border-border/60 bg-card/30" />
        <div className="h-64 rounded-xl border border-border/60 bg-card/30" />
        <div className="h-64 rounded-xl border border-border/60 bg-card/30" />
        <div className="h-64 rounded-xl border border-border/60 bg-card/30" />
      </div>
    </div>
  );
}
