import type { Metadata } from "next";
import Link from "next/link";
import { ScoreBadge } from "@/components/gtm/badges";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { listEvents } from "@/lib/db/queries/events";
import { listLeads, statusCounts, type LeadStatus } from "@/lib/db/queries/leads";
import { confidencePresentation, leadStatusLabel, signalLabel } from "@/lib/gtm-present";
import { formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Pipeline" };
export const dynamic = "force-dynamic";

const GROUPS: { status: LeadStatus; label: string }[] = [
  { status: "needs_review", label: "Needs review" },
  { status: "approved", label: "Approved" },
  { status: "hubspot_synced", label: "Synced" },
  { status: "rejected", label: "Rejected" },
];

export default async function PipelinePage({ searchParams }: PageProps<"/pipeline">) {
  const mode = (await searchParams).view === "board" ? "board" : "list";
  const [counts, events, ...columns] = await Promise.all([
    statusCounts(),
    listEvents(),
    ...GROUPS.map((g) => listLeads({ statuses: [g.status], sort: "score", limit: 50 })),
  ]);
  const eventName = new Map(events.map((e) => [e.id, e.name]));

  const columnData = GROUPS.map((g, i) => {
    const data = columns[i] as Awaited<ReturnType<typeof listLeads>>;
    return { ...g, count: counts[g.status] ?? 0, items: data.items };
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Pipeline</h1>
          <p className="text-muted-foreground">What needs a decision — not what happened in the infrastructure.</p>
        </div>
        <div className="flex rounded-lg border border-border/60 p-0.5 text-[13px]">
          <Link href="/pipeline" className={mode === "list" ? "rounded-md bg-accent px-3 py-1" : "px-3 py-1 text-muted-foreground"}>
            List
          </Link>
          <Link href="/pipeline?view=board" className={mode === "board" ? "rounded-md bg-accent px-3 py-1" : "px-3 py-1 text-muted-foreground"}>
            Board
          </Link>
        </div>
      </div>

      {mode === "board" ? (
        <PipelineBoard columns={JSON.parse(JSON.stringify(columnData))} />
      ) : (
        <>
          <ul className="divide-y rounded-xl border border-border/80 bg-card/30 md:hidden">
            {columnData.flatMap((col) =>
              col.items.map((l) => {
                const conf = confidencePresentation(l.attendanceType);
                return (
                  <li key={l.id}>
                    <Link href={`/leads?lead=${l.id}`} className="block px-3 py-3 hover:bg-accent/40">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">{l.person.fullName}</p>
                          <p className="text-xs text-muted-foreground">{l.company?.name ?? "—"}</p>
                        </div>
                        <div className="flex flex-col items-end shrink-0">
                          <ScoreBadge score={l.priorityScore} size="sm" metric="priority" />
                          <span className="mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium bg-secondary text-secondary-foreground">
                            {leadStatusLabel(l.status)}
                          </span>
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground truncate">
                        {eventName.get(l.event.id)?.slice(0, 30) ?? l.event.name} · {signalLabel(l.attendanceType)} · {conf.tier}
                      </p>
                    </Link>
                  </li>
                );
              }),
            )}
          </ul>
          <div className="hidden overflow-x-auto rounded-xl border border-border/60 bg-card/30 md:block">
            <table className="w-full min-w-[560px] text-left">
              <thead className="border-b border-border/60 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Person</th>
                  <th className="px-4 py-2 font-medium">Score</th>
                  <th className="px-4 py-2 font-medium">Signal</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {columnData.flatMap((col) =>
                  col.items.map((l) => {
                    const conf = confidencePresentation(l.attendanceType);
                    return (
                      <tr key={l.id} className="hover:bg-accent/30">
                        <td className="px-4 py-2.5">
                          <Link href={`/leads?lead=${l.id}`} className="font-medium hover:underline">
                            {l.person.fullName}
                          </Link>
                          <div className="text-xs text-muted-foreground">{l.company?.name}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <ScoreBadge score={l.priorityScore} size="sm" metric="priority" />
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {eventName.get(l.event.id)?.slice(0, 28) ?? l.event.name} · {signalLabel(l.attendanceType)} · {conf.tier}
                        </td>
                        <td className="px-4 py-2.5 text-xs">{leadStatusLabel(l.status)}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatRelative(l.createdAt)}</td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
