"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isActiveStatus, type RunStatus } from "@/lib/run-status";
import { cn } from "@/lib/utils";

export type RunDto = {
  id: string;
  kind: string;
  status: RunStatus;
  stage: string;
  eventsFound: number;
  companiesFound: number;
  peopleFound: number;
  peopleEnriched: number;
  leadsQualified: number;
  error: string | null;
  progress: {
    steps: { at: string; stage: string; message: string; level: "info" | "warn" | "error" }[];
    cursor: {
      stagesDone?: string[];
      queriesDone?: number;
      hits?: unknown[];
      hitsDone?: number;
      assessQueue?: string[];
      assessDone?: number;
      pageUrls?: string[];
      pagesDone?: number;
      companyQueue?: string[];
      companiesDone?: number;
      peopleQueue?: string[];
      peopleDone?: number;
      enrichQueue?: string[];
      enrichDone?: number;
      explainQueue?: string[];
      explainDone?: number;
    };
    counters: { companiesQualified?: number; enrichTarget?: number; aiFailures?: number; apolloPeopleUnavailable?: boolean };
  };
};

type StageRow = { key: string; label: string; detail?: string };

function sourcingStages(run: RunDto): StageRow[] {
  const c = run.progress.cursor;
  const k = run.progress.counters;
  return [
    { key: "discover", label: "Finding event sources", detail: c.pageUrls ? `${c.pageUrls.length} pages preserved` : undefined },
    { key: "extract", label: "Extracting participating companies & speakers", detail: c.pageUrls ? `${Math.min(c.pagesDone ?? 0, c.pageUrls.length)} / ${c.pageUrls.length} pages` : undefined },
    { key: "companies", label: "Qualifying strong-fit accounts", detail: c.companyQueue ? `${Math.min(c.companiesDone ?? 0, c.companyQueue.length)} / ${c.companyQueue.length} enriched${k.companiesQualified != null ? ` · ${k.companiesQualified} passed ICP` : ""}` : undefined },
    { key: "people", label: "Finding decision-makers", detail: c.peopleQueue ? `${Math.min(c.peopleDone ?? 0, c.peopleQueue.length)} / ${c.peopleQueue.length} companies · ${run.peopleFound} people` : undefined },
    { key: "announcements", label: "Verifying event relationships" },
    { key: "enrich", label: "Enriching top candidates", detail: k.apolloPeopleUnavailable ? "Contact details limited — using public profiles" : k.enrichTarget != null ? `${Math.min(c.enrichDone ?? 0, k.enrichTarget)} / ${k.enrichTarget}` : undefined },
    { key: "score", label: "Scoring against the ICP", detail: run.leadsQualified ? `${run.leadsQualified} ready for review` : undefined },
    { key: "explain", label: "Preparing opportunities", detail: c.explainQueue ? `${Math.min(c.explainDone ?? 0, c.explainQueue.length)} / ${c.explainQueue.length}` : undefined },
  ];
}

function discoveryStages(run: RunDto): StageRow[] {
  const c = run.progress.cursor;
  return [
    { key: "discover", label: "Searching the web for upcoming events", detail: `${c.queriesDone ?? 0} / 12 queries · ${c.hits?.length ?? 0} candidate pages` },
    { key: "extract", label: "Extracting & verifying event candidates", detail: c.hits?.length ? `${Math.min(c.hitsDone ?? 0, c.hits.length)} / ${c.hits.length} pages · ${run.eventsFound} new events` : undefined },
    { key: "score", label: "Gathering participant pages & scoring relevance", detail: c.assessQueue?.length ? `${Math.min(c.assessDone ?? 0, c.assessQueue.length)} / ${c.assessQueue.length} events` : undefined },
  ];
}

function stageIndex(run: RunDto): number {
  if (run.kind === "event_discovery") {
    const c = run.progress.cursor;
    if (run.status === "complete") return 3;
    if ((c.hits?.length ?? 0) > 0 && (c.hitsDone ?? 0) >= (c.hits?.length ?? 0) && (c.queriesDone ?? 0) >= 12) return 2;
    if ((c.queriesDone ?? 0) >= 12) return 1;
    return 0;
  }
  const done = run.progress.cursor.stagesDone ?? [];
  return run.status === "complete" ? 8 : done.length;
}

export function RunProgress({ initial, compact = false, onFinished }: { initial: RunDto; compact?: boolean; onFinished?: (run: RunDto) => void }) {
  const router = useRouter();
  const [run, setRun] = useState<RunDto>(initial);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const finished = useRef(false);
  const active = isActiveStatus(run.status);

  const poll = useCallback(async () => {
    try {
      await fetch(`/api/runs/${run.id}/tick`, { method: "POST" });
      const res = await fetch(`/api/runs/${run.id}`, { cache: "no-store" });
      if (res.ok) setRun((await res.json()).run as RunDto);
    } catch {
      /* transient; the next poll retries */
    }
  }, [run.id]);

  useEffect(() => {
    if (!active) return;
    const kick = window.setTimeout(() => void poll(), 0);
    const t = setInterval(poll, 3_000);
    return () => {
      clearTimeout(kick);
      clearInterval(t);
    };
  }, [active, poll]);

  useEffect(() => {
    if (!active && !finished.current) {
      finished.current = true;
      onFinished?.(run);
      router.refresh();
    }
  }, [active, onFinished, router, run]);

  async function act(action: "cancel" | "retry") {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/runs/${run.id}/${action}`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setActionError((body as { error?: string }).error ?? `Request failed (${res.status})`);
      else {
        setRun((body as { run: RunDto }).run);
        finished.current = false;
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const stages = run.kind === "event_discovery" ? discoveryStages(run) : sourcingStages(run);
  const idx = stageIndex(run);
  const warnings = run.progress.steps.filter((s) => s.level !== "info").slice(-3);
  const recent = run.progress.steps.slice(-(compact ? 3 : 6)).reverse();

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2 font-medium">
          {active ? <Loader2 className="size-4 shrink-0 animate-spin text-sky-600" /> : run.status === "complete" ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" /> : run.status === "cancelled" ? <XCircle className="size-4 shrink-0 text-muted-foreground" /> : <XCircle className="size-4 shrink-0 text-destructive" />}
          <span>{run.kind === "event_discovery" ? "Event discovery" : "Lead sourcing"}</span>
          <span className="font-normal text-muted-foreground">· {run.status === "cancel_requested" ? "stopping after current batch" : run.status.replace("_", " ")}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {(run.status === "queued" || run.status === "running") && (
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => act("cancel")}>
              Cancel
            </Button>
          )}
          {(run.status === "failed" || run.status === "cancelled") && (
            <Button size="xs" variant="outline" disabled={busy} onClick={() => act("retry")}>
              {busy ? <Loader2 className="animate-spin" /> : null}Retry
            </Button>
          )}
          <span className="text-[11px] text-muted-foreground">{run.status === "complete" ? "Complete" : run.status === "cancel_requested" ? "Cancelling…" : active ? "In progress" : run.status === "cancelled" ? "Cancelled" : "Stopped"}</span>
        </div>
      </div>
      <ol className="space-y-1.5 px-4 py-3">
        {stages.map((s, i) => {
          const state = i < idx ? "done" : i === idx && active ? "active" : i === idx && run.status === "failed" ? "failed" : "todo";
          return (
            <li key={s.key} className="flex items-start gap-2.5">
              <span className="mt-0.5">
                {state === "done" ? <CheckCircle2 className="size-4 text-emerald-600" /> : state === "active" ? <Loader2 className="size-4 animate-spin text-sky-600" /> : state === "failed" ? <XCircle className="size-4 text-destructive" /> : <CircleDashed className="size-4 text-muted-foreground/60" />}
              </span>
              <div className={cn("min-w-0", state === "todo" && "text-muted-foreground")}>
                <div className="font-medium">{s.label}</div>
                {s.detail && state !== "todo" && <div className="text-xs text-muted-foreground">{s.detail}</div>}
              </div>
            </li>
          );
        })}
      </ol>
      {actionError && <div className="mx-4 mb-3 rounded-md bg-red-50 p-2.5 text-xs text-red-800">{actionError}</div>}
      {run.status === "queued" && !run.progress.steps.length && (
        <div className="mx-4 mb-3 text-xs text-muted-foreground">Starting discovery — this page advances the run while it is open…</div>
      )}
      {run.error && (
        <div className="mx-4 mb-3 flex items-start gap-2 rounded-md bg-red-50 p-2.5 text-xs text-red-800">
          <XCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>{run.error}</span>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mx-4 mb-3 space-y-1 rounded-md bg-amber-50 p-2.5 text-xs text-amber-900">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}
      <details className="border-t px-4 py-2 text-xs" open={!compact && active}>
        <summary className="cursor-pointer select-none text-muted-foreground">Activity log</summary>
        <ul className="mt-2 space-y-1 font-mono text-[11px] leading-4 text-muted-foreground">
          {recent.map((s, i) => (
            <li key={i}>
              <span className="text-foreground/50">{s.at.slice(11, 19)}</span> {s.message}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
