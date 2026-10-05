"use client";

import { BAND_LABEL, type ConfidenceAssessment, type ConfidenceBand } from "@/lib/confidence";
import { MetricInfo } from "@/components/ui/metric-info";
import { cn } from "@/lib/utils";

const TONE: Record<ConfidenceBand, string> = {
  confirmed: "text-emerald-400",
  strong: "text-sky-400",
  moderate: "text-amber-400/90",
  weak: "text-muted-foreground",
  unverified: "text-muted-foreground",
  conflicted: "text-rose-400",
};

export function ConfidenceBadge({
  assessment,
  compact = false,
}: {
  assessment: Pick<ConfidenceAssessment, "band" | "label" | "summary" | "why" | "uncertainty" | "internalScore" | "previousBand" | "changeReason">;
  compact?: boolean;
}) {
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1">
        <span className={cn("font-medium", TONE[assessment.band])}>{assessment.label || BAND_LABEL[assessment.band]}</span>
        <MetricInfo
          label={`${assessment.label} confidence`}
          description={assessment.summary}
          factors={assessment.why}
          interpretation={assessment.uncertainty.length ? `Uncertainty: ${assessment.uncertainty.join(" ")}` : "No material gap is recorded."}
          internal={assessment.internalScore}
        />
      </span>
      {!compact && <span className="text-muted-foreground">{assessment.summary}</span>}
      {assessment.changeReason && <span className="text-[11px] text-muted-foreground">{assessment.changeReason}</span>}
    </span>
  );
}
