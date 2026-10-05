"use client";

import Link from "next/link";
import { ScoreBadge } from "@/components/gtm/badges";
import { confidencePresentation, signalLabel } from "@/lib/gtm-present";
import type { LeadListItem } from "@/lib/db/queries/leads";

type Col = { status: string; label: string; count: number; items: LeadListItem[] };

export function PipelineBoard({ columns }: { columns: Col[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {columns.map((col) => (
        <section key={col.status} className="flex flex-col rounded-xl border border-border/60 bg-card/30">
          <header className="border-b border-border/60 px-3 py-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">{col.label}</h2>
              <span className="font-mono text-sm tabular-nums">{col.count}</span>
            </div>
          </header>
          <ul className="flex-1 divide-y divide-border/40">
            {col.items.length === 0 ? (
              <li className="p-3 text-xs text-muted-foreground">Empty</li>
            ) : (
              col.items.slice(0, 12).map((l) => (
                <li key={l.id}>
                  <Link href={`/leads?lead=${l.id}`} className="block px-3 py-2.5 hover:bg-accent/40">
                    <div className="flex items-start gap-2">
                      <ScoreBadge score={l.priorityScore} size="sm" metric="priority" />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{l.person.fullName}</div>
                        <div className="truncate text-xs text-muted-foreground">{l.company?.name}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {signalLabel(l.attendanceType)} · {confidencePresentation(l.attendanceType).tier}
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
