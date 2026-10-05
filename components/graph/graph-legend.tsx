"use client";

export function GraphLegend({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <div className="absolute left-3 bottom-3 z-10 rounded-lg border border-border/60 bg-card/80 px-2 py-1.5 text-[10px] text-muted-foreground backdrop-blur-sm">
      <button type="button" onClick={onToggle} className="font-medium text-foreground/80">
        Legend {collapsed ? "+" : "−"}
      </button>
      {!collapsed && (
        <ul className="mt-1 space-y-0.5">
          <li>━━ Verified edge</li>
          <li>- - Inferred edge</li>
          <li>Opportunity · Company · Person · Event · ◇ Signal</li>
        </ul>
      )}
    </div>
  );
}
