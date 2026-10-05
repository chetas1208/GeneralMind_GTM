"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import { METRIC_COPY, type MetricKey } from "@/lib/confidence/metrics";

export function MetricInfo({
  metric,
  label,
  value,
  display,
  description,
  factors,
  interpretation,
  internal,
}: {
  metric?: MetricKey;
  label?: string;
  value?: number | string | null;
  /** Shown instead of the raw number. The number stays in the details. */
  display?: string | null;
  description?: string;
  factors?: readonly string[];
  interpretation?: string;
  /** 0–1 or already-labeled internal ranking aid. */
  internal?: number | null;
}) {
  const copy = metric ? METRIC_COPY[metric] : null;
  const title = label ?? copy?.label ?? "About this metric";
  const body = description ?? copy?.description ?? "";
  const parts = factors ?? copy?.factors ?? [];
  const how = interpretation ?? copy?.interpretation ?? "";
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const panelId = useId();
  const open = pinned || hover;

  useEffect(() => {
    if (!pinned) return;
    const onDoc = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setPinned(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPinned(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  const shown = display ?? (value == null || value === "" ? null : String(value));

  return (
    <span
      ref={root}
      className="relative inline-flex items-center gap-1"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {shown != null && <span>{shown}</span>}
      <button
        type="button"
        aria-label={`About ${title}`}
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        onClick={() => setPinned((v) => !v)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
      >
        <Info className="size-3.5" />
      </button>
      {open && (
        <span
          id={panelId}
          role="dialog"
          className="absolute left-0 top-full z-40 mt-1 w-64 rounded-md border border-border/70 bg-card px-2.5 py-2 text-[11px] leading-snug text-muted-foreground shadow-md"
        >
          <span className="block font-medium text-foreground">{title}</span>
          {body && <span className="mt-1 block">{body}</span>}
          {parts.length > 0 && (
            <span className="mt-1.5 block">
              It considers:
              <span className="mt-0.5 block">
                {parts.map((f) => (
                  <span key={f} className="block">
                    · {f}
                  </span>
                ))}
              </span>
            </span>
          )}
          {how && <span className="mt-1.5 block">{how}</span>}
          {(internal != null || (display && value != null)) && (
            <details className="mt-1.5">
              <summary className="cursor-pointer text-foreground/80">Details</summary>
              <span className="mt-1 block">
                Internal ranking aid: {internal != null ? internal.toFixed(2) : value}
              </span>
            </details>
          )}
        </span>
      )}
    </span>
  );
}
