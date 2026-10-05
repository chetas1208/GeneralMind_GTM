"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, SlidersHorizontal, X } from "lucide-react";
import { ScoreBadge } from "@/components/gtm/badges";
import { LeadDetailView, type LeadDetailDto } from "@/components/leads/lead-detail-view";
import { confidencePresentation, emailPresentation, leadStatusLabel, signalLabel } from "@/lib/gtm-present";
import { cn } from "@/lib/utils";
import type { LeadListItem, LeadSort } from "@/lib/db/queries/leads";

const COLS_KEY = "gm-leads-columns";

type ColKey = "industry" | "event" | "persona" | "email" | "fit";

const DEFAULT_COLS: Record<ColKey, boolean> = { event: false, industry: false, persona: false, email: false, fit: false };

function readStoredCols(): Record<ColKey, boolean> {
  if (typeof window === "undefined") return DEFAULT_COLS;
  try {
    const raw = localStorage.getItem(COLS_KEY);
    if (raw) return { ...DEFAULT_COLS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_COLS;
}

const OPTIONAL_COLS: { key: ColKey; label: string }[] = [
  { key: "event", label: "Event" },
  { key: "industry", label: "Industry" },
  { key: "persona", label: "Persona" },
  { key: "email", label: "Contact" },
  { key: "fit", label: "Fit breakdown" },
];

export type LeadsWorkbenchProps = {
  items: LeadListItem[];
  total: number;
  viewKey: string;
  views: { key: string; label: string; count: number }[];
  events: { id: string; name: string }[];
  personas: string[];
  filters: {
    q?: string;
    eventId?: string;
    persona?: string;
    industry?: string;
    minScore?: number;
    minAttendance?: number;
    sort: LeadSort;
  };
  crmConfigured: boolean;
  peekDetail: LeadDetailDto | null;
  peekApproved: boolean;
};

export function LeadsWorkbench({
  items,
  total,
  viewKey,
  views,
  events,
  filters,
  crmConfigured,
  peekDetail,
  peekApproved,
}: LeadsWorkbenchProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const selectedId = sp.get("lead");
  const [cols, setCols] = useState(readStoredCols);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [navPending, startNav] = useTransition();
  const [reviewPending, startReview] = useTransition();

  const detailReady = Boolean(selectedId && peekDetail && peekDetail.lead.id === selectedId);
  const detailLoading = Boolean(selectedId && !detailReady && (navPending || peekDetail !== null));
  const detailMissing = Boolean(selectedId && !detailReady && !navPending && !peekDetail);

  const selectLead = useCallback(
    (id: string | null) => {
      const p = new URLSearchParams(sp.toString());
      if (id) p.set("lead", id);
      else p.delete("lead");
      startNav(() => router.push(`/leads?${p.toString()}`, { scroll: false }));
    },
    [router, sp],
  );

  const runReview = useCallback(
    (path: "approve" | "reject", body?: Record<string, unknown>) => {
      if (!selectedId) return;
      startReview(async () => {
        await fetch(`/api/leads/${selectedId}/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body ?? {}),
        });
        router.refresh();
      });
    },
    [router, selectedId],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!selectedId || items.length === 0) return;
      const i = items.findIndex((x) => x.id === selectedId);
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = items[Math.min(i + 1, items.length - 1)];
        if (next) selectLead(next.id);
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = items[Math.max(i - 1, 0)];
        if (prev) selectLead(prev.id);
      }
      if (e.key === "Escape") selectLead(null);
      if (detailReady && !reviewPending && peekDetail) {
        const locked = peekDetail.lead.status === "hubspot_synced";
        if (e.key === "a" || e.key === "A") {
          if (!locked && peekDetail.lead.status !== "approved") {
            e.preventDefault();
            runReview("approve");
          }
        }
        if (e.key === "r" || e.key === "R") {
          if (!locked && peekDetail.lead.status !== "rejected") {
            e.preventDefault();
            runReview("reject", { reason: "not_icp" });
          }
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, items, selectLead, detailReady, reviewPending, peekDetail, runReview]);

  function toggleCol(key: ColKey) {
    setCols((c) => {
      const next = { ...c, [key]: !c[key] };
      localStorage.setItem(COLS_KEY, JSON.stringify(next));
      return next;
    });
  }

  const approved = detailReady ? peekApproved : false;

  return (
    <div className="flex min-h-[calc(100vh-6rem)] flex-col gap-4 lg:flex-row lg:gap-0">
      <div className={cn("min-w-0 flex-1 space-y-4", selectedId && "lg:pr-4 lg:border-r lg:border-border/60")}>
        <div>
          <h1 className="text-base font-semibold tracking-tight">Leads</h1>
          <p className="text-muted-foreground">Decision-makers tied to real market signals — with evidence, scores, and review in one place.</p>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-border/60">
          {views.map((v) => (
            <Link
              key={v.key}
              href={hrefView(v.key, sp)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground",
                v.key === viewKey ? "border-primary text-foreground" : "border-transparent",
              )}
            >
              {v.label} <span className="ml-1 font-mono text-xs opacity-70">{v.count}</span>
            </Link>
          ))}
        </div>

        <form method="get" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="view" value={viewKey} />
          <input name="q" defaultValue={filters.q} placeholder="Search" className="h-8 w-44 rounded-lg border bg-card/80 px-2.5 text-[13px]" />
          <select name="event" defaultValue={filters.eventId ?? ""} className="h-8 rounded-lg border bg-card/80 px-2 text-[13px]" aria-label="Event">
            <option value="">All events</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name.slice(0, 40)}
              </option>
            ))}
          </select>
          <select name="minScore" defaultValue={filters.minScore ?? ""} className="h-8 rounded-lg border bg-card/80 px-2 text-[13px]" aria-label="Min score">
            <option value="">Score</option>
            {[55, 65, 75, 85].map((n) => (
              <option key={n} value={n}>
                ≥ {n}
              </option>
            ))}
          </select>
          <select name="sort" defaultValue={filters.sort} className="h-8 rounded-lg border bg-card/80 px-2 text-[13px]" aria-label="Sort">
            <option value="priority">Priority</option>
            <option value="score">Highest score</option>
            <option value="attendance">Strongest signal</option>
            <option value="company_fit">Company fit</option>
            <option value="newest">Newest</option>
          </select>
          <button type="submit" className="h-8 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground">
            Apply
          </button>
          <button type="button" onClick={() => setDisplayOpen((o) => !o)} className="ml-auto flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[13px] text-muted-foreground hover:text-foreground">
            <SlidersHorizontal className="size-3.5" /> Display
          </button>
        </form>

        {displayOpen && (
          <div className="flex flex-wrap gap-2 rounded-lg border bg-card/50 p-2">
            {OPTIONAL_COLS.map((c) => (
              <label key={c.key} className="flex cursor-pointer items-center gap-1.5 text-xs">
                <input type="checkbox" checked={cols[c.key]} onChange={() => toggleCol(c.key)} />
                {c.label}
              </label>
            ))}
          </div>
        )}

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed p-10 text-center">
            {viewKey === "review" && !filters.q && !filters.eventId ? (
              <>
                <p className="font-medium">No review-ready opportunities</p>
                <p className="mt-1 text-muted-foreground">
                  Source an event or refresh market intelligence. People appear only after their account, role and evidence clear the qualification bar.
                </p>
                <Link href="/radar" className="mt-3 inline-block text-sm text-sky-400 hover:underline">
                  Go to Radar
                </Link>
              </>
            ) : (
              <>
                <p className="font-medium">No leads match</p>
                <p className="mt-1 text-muted-foreground">
                  <Link href="/radar" className="underline">
                    Open Radar
                  </Link>{" "}
                  and research an event.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
          <ul className="divide-y rounded-xl border border-border/80 bg-card/30 md:hidden">
            {items.map((l) => (
              <li key={l.id}>
                <button type="button" className="w-full px-3 py-3 text-left" onClick={() => selectLead(l.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{l.person.fullName}</p>
                      <p className="text-xs text-muted-foreground">{l.person.title ?? "Role unknown"} · {l.company?.name ?? "—"}</p>
                    </div>
                    <ScoreBadge score={l.priorityScore} size="sm" />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{l.event.name} · {leadStatusLabel(l.status)}</p>
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-xl border border-border/80 bg-card/30 md:block">
            <table className="w-full min-w-[720px] text-left">
              <thead className="border-b border-border/60 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Score</th>
                  <th className="px-3 py-2 font-medium">Person</th>
                  <th className="px-3 py-2 font-medium">Company</th>
                  <th className="px-3 py-2 font-medium">Signal</th>
                  <th className="px-3 py-2 font-medium">Confidence</th>
                  {cols.event && <th className="px-3 py-2 font-medium">Event</th>}
                  {cols.industry && <th className="px-3 py-2 font-medium">Industry</th>}
                  {cols.persona && <th className="px-3 py-2 font-medium">Persona</th>}
                  {cols.email && <th className="px-3 py-2 font-medium">Contact</th>}
                  {cols.fit && <th className="px-3 py-2 font-medium">Fit</th>}
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {items.map((l) => {
                  const conf = confidencePresentation(l.attendanceType, l.attendanceConfidence);
                  const active = l.id === selectedId;
                  return (
                    <tr
                      key={l.id}
                      tabIndex={0}
                      onClick={() => selectLead(l.id)}
                      onKeyDown={(e) => e.key === "Enter" && selectLead(l.id)}
                      className={cn("cursor-pointer align-middle outline-none hover:bg-accent/40 focus-visible:bg-accent/50", active && "bg-accent/60")}
                    >
                      <td className="px-3 py-2">
                        <ScoreBadge score={l.totalScore} size="sm" />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{l.person.fullName}</div>
                        <div className="text-xs text-muted-foreground">{l.person.title ?? "—"}</div>
                      </td>
                      <td className="px-3 py-2">{l.company?.name ?? "—"}</td>
                      <td className="max-w-[140px] px-3 py-2 text-xs text-muted-foreground">
                        {signalLabel(l.attendanceType)} · {l.event.name.slice(0, 24)}
                        {l.event.name.length > 24 ? "…" : ""}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className="font-medium">{conf.tier}</span>
                        <span className="text-muted-foreground"> · {conf.detail}</span>
                      </td>
                      {cols.event && <td className="px-3 py-2 text-xs">{l.event.name}</td>}
                      {cols.industry && <td className="px-3 py-2 text-xs text-muted-foreground">{l.company?.industry ?? "—"}</td>}
                      {cols.persona && <td className="px-3 py-2 text-xs">{l.person.persona ?? "—"}</td>}
                      {cols.email && (
                        <td className="px-3 py-2 text-xs">
                          {l.person.email
                            ? emailPresentation(l.person.email, l.person.emailStatus).text
                            : l.person.linkedinUrl
                              ? "LinkedIn (verified profile)"
                              : "—"}
                        </td>
                      )}
                      {cols.fit && (
                        <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                          {l.companyFitScore}·{l.personaFitScore}·{l.intentScore}
                        </td>
                      )}
                      <td className="px-3 py-2 text-xs">{leadStatusLabel(l.status)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="border-t border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
              {items.length} of {total} · ↑↓ between leads · A approve · R reject · Esc close
            </p>
          </div>
          </>
        )}
      </div>

      {selectedId && (
        <aside className="fixed inset-0 z-40 bg-black/40 lg:static lg:z-auto lg:w-[min(440px,42vw)] lg:shrink-0 lg:bg-transparent">
          <div className="ml-auto flex h-full max-w-md flex-col border-l border-border/80 bg-background shadow-xl lg:max-w-none lg:shadow-none">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
              <span className="text-xs font-medium text-muted-foreground">Lead intelligence</span>
              <button type="button" onClick={() => selectLead(null)} className="rounded-md p-1 hover:bg-accent" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {detailLoading && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Loading…
                </div>
              )}
              {detailMissing && <p className="text-sm text-muted-foreground">Lead not found.</p>}
              {detailReady && peekDetail && (
                <LeadDetailView detail={peekDetail} crmConfigured={crmConfigured} approved={approved} compact />
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

function hrefView(key: string, sp: URLSearchParams) {
  const p = new URLSearchParams(sp.toString());
  p.set("view", key);
  p.delete("lead");
  return `/leads?${p.toString()}`;
}
