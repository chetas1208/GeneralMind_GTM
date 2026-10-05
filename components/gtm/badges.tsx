import { cn } from "@/lib/utils";
import { humanize } from "@/lib/format";
import { assessAttendance, leadStatusLabel } from "@/lib/gtm-present";
import { MetricInfo } from "@/components/ui/metric-info";
import type { MetricKey } from "@/lib/confidence/metrics";

export function ScoreBadge({
  score,
  max = 100,
  size = "md",
  metric,
  band,
}: {
  score: number | null | undefined;
  max?: number;
  size?: "sm" | "md" | "lg";
  metric?: MetricKey;
  /** Qualitative stand-in. The raw score stays inside Details. */
  band?: string | null;
}) {
  if (score == null && !band) return <span className="text-muted-foreground">—</span>;
  const pct = (score ?? 0) / max;
  const tone =
    pct >= 0.75
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : pct >= 0.55
        ? "bg-amber-50 text-amber-800 ring-amber-200"
        : "bg-muted text-muted-foreground ring-border";
  const internal = score == null ? null : max === 100 ? score / 100 : score / max;
  return (
    <span className="inline-flex items-center gap-1">
      {band ? (
        <span className={cn("font-medium", size === "lg" ? "text-base" : "text-xs")}>{band}</span>
      ) : (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-md font-mono font-semibold tabular-nums ring-1 ring-inset",
            size === "sm" && "min-w-8 px-1.5 py-0.5 text-[11px]",
            size === "md" && "min-w-10 px-2 py-0.5 text-[13px]",
            size === "lg" && "min-w-14 px-3 py-1 text-lg",
            tone,
          )}
        >
          {score}
        </span>
      )}
      {metric && <MetricInfo metric={metric} internal={internal} />}
    </span>
  );
}

const statusTones: Record<string, string> = {
  discovered: "bg-muted text-muted-foreground",
  enriching: "bg-sky-50 text-sky-800",
  qualified: "bg-sky-50 text-sky-800",
  needs_review: "bg-amber-50 text-amber-800",
  approved: "bg-emerald-50 text-emerald-800",
  rejected: "bg-rose-50 text-rose-800",
  hubspot_synced: "bg-violet-50 text-violet-800",
  failed: "bg-red-50 text-red-800",
  selected: "bg-emerald-50 text-emerald-800",
  archived: "bg-muted text-muted-foreground",
  queued: "bg-muted text-muted-foreground",
  running: "bg-sky-50 text-sky-800",
  cancel_requested: "bg-amber-50 text-amber-800",
  cancelled: "bg-muted text-muted-foreground",
  complete: "bg-emerald-50 text-emerald-800",
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", statusTones[status] ?? "bg-muted text-muted-foreground")}>
      {label ?? leadStatusLabel(status)}
    </span>
  );
}

/** Attendance language is deliberate: only confirmed types say "attending/speaking". */
export function AttendanceBadge({ type }: { type: string }) {
  const confirmed = type === "official_speaker" || type === "organizer" || type === "public_attendance";
  const label: Record<string, string> = {
    official_speaker: "Official speaker",
    organizer: "Organizer",
    public_attendance: "Publicly stated",
    exhibitor_employee: "Exhibitor employee",
    sponsor_employee: "Sponsor employee",
    partner_employee: "Partner employee",
    company_participating: "Company participating",
    inferred: "Inferred",
  };
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1.5">
        <span className={cn("inline-block size-1.5 rounded-full", confirmed ? "bg-emerald-500" : "bg-amber-400")} />
        <span className="font-medium">{assessAttendance(type).tier}</span>
      </span>
      <span className="text-[11px] text-muted-foreground">{label[type] ?? humanize(type)}</span>
    </div>
  );
}

export function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded border bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground", className)}>{children}</span>;
}
