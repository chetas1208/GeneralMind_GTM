import { signalTypeLabel } from "@/lib/gtm-present";
import { formatRelative } from "@/lib/format";

export function SignalTimeline({
  items,
}: {
  items: {
    id: string;
    type: string;
    direction: string;
    title: string;
    summary: string;
    occurredAt: Date | null;
    discoveredAt: Date;
    sourceUrl: string;
  }[];
}) {
  if (!items.length) return <p className="text-sm text-muted-foreground">No verified signals yet.</p>;

  return (
    <ol className="relative space-y-4 border-l border-border/60 pl-4">
      {items.map((s) => (
        <li key={s.id} className="relative">
          <span className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-primary/80" />
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {(s.occurredAt ?? s.discoveredAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] font-medium">{signalTypeLabel(s.type)}</span>
            {s.direction === "negative" && <span className="text-[10px] text-amber-500">Caution</span>}
          </div>
          <p className="mt-1 font-medium text-[13px]">{s.title}</p>
          <p className="text-xs text-muted-foreground line-clamp-2">{s.summary}</p>
          {s.sourceUrl && (
            <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[11px] text-sky-400 hover:underline">
              Open source ↗
            </a>
          )}
          <p className="mt-0.5 text-[10px] text-muted-foreground">Updated {formatRelative(s.discoveredAt)}</p>
        </li>
      ))}
    </ol>
  );
}
