import { Loader2 } from "lucide-react";

export default function LeadsLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin text-primary" />
        <span>Loading leads workbench…</span>
      </div>
      <div>
        <div className="h-6 w-32 rounded bg-card/60" />
        <div className="mt-1 h-4 w-72 rounded bg-card/40" />
      </div>
      <div className="h-9 w-full rounded-lg border border-border/60 bg-card/30" />
      <div className="h-96 rounded-xl border border-border/60 bg-card/30" />
    </div>
  );
}
