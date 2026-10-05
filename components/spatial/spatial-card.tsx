"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  className?: string;
  depth?: number;
  interactive?: boolean;
  glow?: boolean;
};

/** Subtle perspective card — tables and dense lists should stay flat. */
export function SpatialCard({ children, className, depth = 1, interactive = true, glow = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  function onMove(e: React.MouseEvent) {
    if (!interactive || !ref.current) return;
    const el = ref.current;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${(-py * 2).toFixed(2)}deg) rotateY(${(px * 3).toFixed(2)}deg) translateZ(${depth * 4}px)`;
  }

  function onLeave() {
    if (!ref.current) return;
    ref.current.style.transform = `perspective(900px) translateZ(${depth * 2}px)`;
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={cn(
        "relative rounded-xl border bg-card/90 transition-[transform,box-shadow] duration-200 ease-out will-change-transform motion-reduce:!transform-none motion-reduce:transition-none",
        glow && "before:pointer-events-none before:absolute before:inset-0 before:rounded-xl before:bg-[radial-gradient(600px_circle_at_var(--mx,50%)_var(--my,0%),oklch(0.55_0.08_260/0.12),transparent_45%)]",
        className,
      )}
      style={{ transform: `perspective(900px) translateZ(${depth * 2}px)` }}
    >
      {children}
    </div>
  );
}
