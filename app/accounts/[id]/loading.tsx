import { Loader2 } from "lucide-react";

export default function AccountLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin text-primary" />
        <span>Loading account intelligence…</span>
      </div>
      <div className="space-y-2 border-b border-border/60 pb-5">
        <div className="h-7 w-48 rounded-lg bg-card/60" />
        <div className="h-4 w-72 rounded bg-card/40" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-20 rounded-xl border border-border/60 bg-card/30" />
        <div className="h-20 rounded-xl border border-border/60 bg-card/30" />
        <div className="h-20 rounded-xl border border-border/60 bg-card/30" />
      </div>
      <div className="h-64 rounded-xl border border-border/60 bg-card/30" />
    </div>
  );
}
