import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "companies", label: "Companies" },
  { key: "people", label: "People" },
  { key: "evidence", label: "Evidence" },
  { key: "trace", label: "Trace evidence" },
] as const;

export type EventTabKey = (typeof TABS)[number]["key"];

export function EventTabBar({ eventId, active }: { eventId: string; active: EventTabKey }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border/60" aria-label="Event sections">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/events/${eventId}?tab=${t.key}`}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground",
            active === t.key ? "border-primary text-foreground" : "border-transparent",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function parseEventTab(raw: string | undefined): EventTabKey {
  if (raw === "graph") return "trace";
  if (raw === "companies" || raw === "people" || raw === "evidence" || raw === "trace") return raw;
  return "overview";
}
