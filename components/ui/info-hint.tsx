"use client";

import { useState } from "react";
import { Info } from "lucide-react";

/** Secondary explanation. Hover, focus, or tap — never permanent page copy. */
export function InfoHint({ label, children }: { label: string; children: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
      >
        <Info className="size-3.5" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-30 mt-1 w-56 -translate-x-1/2 rounded-md border border-border/70 bg-card px-2 py-1.5 text-[11px] leading-snug text-muted-foreground shadow-md"
        >
          {children}
        </span>
      )}
    </span>
  );
}
