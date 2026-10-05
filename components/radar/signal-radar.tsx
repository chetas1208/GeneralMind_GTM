"use client";

import { SpatialEventCard, type EventCardData } from "./spatial-event-card";

/** Selected events as a spatial card grid — every card maps to a real event in Neon. */
export function SignalRadar({ events }: { events: EventCardData[] }) {
  if (events.length === 0) return null;

  return (
    <div className="relative mb-6 rounded-2xl border border-border/60 bg-gradient-to-b from-card/30 to-transparent p-4">
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-[0.06]"
        style={{
          backgroundImage: "radial-gradient(ellipse at 30% 0%, oklch(0.55 0.1 260), transparent 50%)",
        }}
      />
      <p className="relative mb-4 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Upcoming signals</p>
      <div className="relative grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {events.map((e) => (
          <SpatialEventCard key={e.id} event={e} />
        ))}
      </div>
    </div>
  );
}
