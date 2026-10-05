"use client";

import Link from "next/link";
import { GraphView } from "@/components/graph/graph-view";

export function LeadTraceGraph({ leadId }: { leadId: string }) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why this opportunity</h3>
        <Link
          href={`/radar?view=graph&scope=opportunity&entityId=${leadId}&trace=1`}
          className="text-[11px] text-sky-400 hover:underline"
        >
          Open full graph →
        </Link>
      </div>
      <GraphView scope="opportunity" entityId={leadId} trace minHeight={360} />
    </section>
  );
}
