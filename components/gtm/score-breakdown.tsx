import { cn } from "@/lib/utils";

type Factor = { key: string; label: string; points: number; max: number; note: string };
export type ScoreSection = { total: number; max: number; factors: Factor[] };
type Section = ScoreSection;

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full", pct >= 75 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-400" : "bg-zinc-300")} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function SectionBreakdown({ title, section }: { title: string; section: Section }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
        <span className="font-mono text-sm font-semibold tabular-nums">
          {section.total}
          <span className="text-muted-foreground">/{section.max}</span>
        </span>
      </div>
      <ul className="space-y-2">
        {section.factors.map((f) => (
          <li key={f.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{f.label}</span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {f.points}/{f.max}
              </span>
            </div>
            <Bar value={f.points} max={f.max} />
            <p className="mt-0.5 text-xs text-muted-foreground">{f.note}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
