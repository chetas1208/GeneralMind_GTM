"use client";

import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";
import { SpatialCard } from "@/components/spatial/spatial-card";
import { ScoreBadge } from "@/components/gtm/badges";
import { relevanceBand } from "@/lib/confidence";
import { formatDateRange, formatLocation } from "@/lib/format";

export type EventCardData = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  relevanceScore: number | null;
  companyCount: number;
  leadCount: number;
  reviewCount: number;
  targetPersonas: string[];
  relevanceReason: string | null;
};

export function SpatialEventCard({ event }: { event: EventCardData }) {
  const tier = relevanceBand(event.relevanceScore);
  const loc = formatLocation(event);

  return (
    <SpatialCard className="p-4 shadow-md shadow-black/15" glow interactive>
        <Link href={`/events/${event.id}`} className="block space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 font-semibold leading-snug">{event.name}</h3>
            <ScoreBadge score={event.relevanceScore} size="sm" metric="eventRelevance" band={tier} />
          </div>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3" />
              {formatDateRange(event.startDate, event.endDate)}
            </span>
            {loc !== "—" && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {loc}
              </span>
            )}
          </p>
          {tier && <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-400/90">{tier}</p>}
          <p className="text-xs text-muted-foreground">
            {event.companyCount} companies · {event.leadCount} leads
            {event.reviewCount > 0 && <span className="text-amber-400/90"> · {event.reviewCount} to review</span>}
          </p>
          {event.targetPersonas.length > 0 && (
            <p className="line-clamp-1 text-[11px] text-muted-foreground">{event.targetPersonas.slice(0, 4).join(" · ")}</p>
          )}
        </Link>
      </SpatialCard>
  );
}
