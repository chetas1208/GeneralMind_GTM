import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RunProgress } from "@/components/gtm/run-progress";
import { StatusPill } from "@/components/gtm/badges";
import { getEvent } from "@/lib/db/queries/events";
import { getRun } from "@/lib/db/queries/runs";
import { toRunDto } from "@/lib/dto";
import { formatRelative, humanize } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/runs/[id]">): Promise<Metadata> {
  const { id } = await params;
  const run = /^[0-9a-f-]{36}$/i.test(id) ? await getRun(id) : null;
  return { title: run ? `Run ${run.id.slice(0, 8)}` : "Run" };
}

export default async function RunDetailPage({ params }: PageProps<"/runs/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const run = await getRun(id);
  if (!run) notFound();
  const event = run.eventId ? await getEvent(run.eventId) : null;
  const c = run.progress.cursor;
  const k = run.progress.counters;
  const dto = toRunDto(run);
  const failedSteps = run.progress.steps.filter((s) => s.level === "error");

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/pipeline" className="hover:text-foreground">
            Pipeline
          </Link>
          <span>/</span>
          <span className="font-mono">{run.id.slice(0, 8)}</span>
        </div>
        <h1 className="text-lg font-semibold tracking-tight">
          {run.kind === "event_discovery" ? "Event discovery run" : "Lead sourcing run"}
        </h1>
        {event && (
          <p className="text-muted-foreground">
            Event:{" "}
            <Link href={`/events/${event.id}`} className="text-foreground underline-offset-2 hover:underline">
              {event.name}
            </Link>
          </p>
        )}
      </div>

      <RunProgress initial={dto} />

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Run summary</h2>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Status" value={<StatusPill status={run.status} />} />
          <Stat label="Stage" value={humanize(run.stage)} />
          <Stat label="Started" value={run.startedAt ? formatRelative(run.startedAt) : "—"} />
          <Stat label="Finished" value={run.completedAt ? formatRelative(run.completedAt) : "—"} />
          {run.kind === "event_discovery" && <Stat label="Events found" value={String(run.eventsFound)} />}
          {run.kind === "lead_sourcing" && (
            <>
              <Stat label="Companies" value={String(run.companiesFound)} />
              <Stat label="Qualified cos." value={String(k.companiesQualified ?? "—")} />
              <Stat label="People" value={String(run.peopleFound)} />
              <Stat label="Enriched" value={String(run.peopleEnriched)} />
              <Stat label="Leads for review" value={String(run.leadsQualified)} />
              <Stat label="Apollo calls" value={String(k.apolloCalls ?? 0)} />
              <Stat label="AI failures" value={String(k.aiFailures ?? 0)} />
            </>
          )}
        </dl>
        {run.error && <p className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-800">{run.error}</p>}
        {k.apolloPeopleUnavailable && (
          <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
            Apollo People Search/Match unavailable on this plan — personas were discovered from event pages and public web profiles instead.
          </p>
        )}
      </section>

      {run.kind === "lead_sourcing" && (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Stage cursor (Neon)</h2>
          <pre className="max-h-48 overflow-auto rounded-md bg-muted/50 p-2 font-mono text-[11px] leading-relaxed">
            {JSON.stringify({ stagesDone: c.stagesDone, companiesDone: c.companiesDone, peopleDone: c.peopleDone, enrichDone: c.enrichDone }, null, 2)}
          </pre>
        </section>
      )}

      {failedSteps.length > 0 && (
        <section className="rounded-lg border border-red-200 bg-red-50/50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-red-900">Failed items ({failedSteps.length})</h2>
          <ul className="space-y-1 text-xs text-red-800">
            {failedSteps.map((s, i) => (
              <li key={i}>
                <span className="font-mono text-red-600">{s.at.slice(11, 19)}</span> [{humanize(s.stage)}] {s.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border bg-card">
        <div className="border-b px-4 py-2.5 text-sm font-semibold">Full activity log</div>
        <ul className="max-h-[420px] divide-y overflow-y-auto">
          {run.progress.steps.length === 0 ? (
            <li className="p-4 text-muted-foreground">No steps recorded yet.</li>
          ) : (
            run.progress.steps.map((s, i) => (
              <li key={i} className="flex gap-3 px-4 py-2 text-xs">
                <span className="shrink-0 font-mono text-muted-foreground">{s.at.replace("T", " ").slice(0, 19)}</span>
                <span className={s.level === "error" ? "text-destructive" : s.level === "warn" ? "text-amber-800" : ""}>{s.message}</span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}
