import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DiscoverEventsButton, RefreshIntelligenceButton, SourceLeadsButton } from "@/components/gtm/action-buttons";
import { RadarViewTabs } from "@/components/radar/radar-view-tabs";
import { SignalRadar } from "@/components/radar/signal-radar";
import { RunProgress } from "@/components/gtm/run-progress";
import { listEvents } from "@/lib/db/queries/events";
import { listTopOpportunities, statusCounts } from "@/lib/db/queries/leads";
import { listRecentSignals, listTopAccountsByPriority } from "@/lib/db/queries/signals";
import { signalLabel, signalTypeLabel } from "@/lib/gtm-present";
import { findActiveRun } from "@/lib/db/queries/runs";
import { toRunDto } from "@/lib/dto";
import { isConfigured } from "@/lib/env";
import { isActiveStatus } from "@/lib/run-status";
import { ScoreBadge } from "@/components/gtm/badges";
import { formatDateRange, formatLocation } from "@/lib/format";

export const metadata: Metadata = { title: "Radar" };
export const dynamic = "force-dynamic";

export default async function RadarPage() {
  const [selected, candidates, activeDiscovery, counts, topOpps, topAccounts, recentSignals] = await Promise.all([
    listEvents({ statuses: ["selected"] }),
    listEvents({ statuses: ["discovered"] }),
    findActiveRun(null, "event_discovery"),
    statusCounts(),
    listTopOpportunities(10),
    listTopAccountsByPriority(8),
    listRecentSignals(12),
  ]);
  const canSource = isConfigured("EXA_API_KEY") && isConfigured("NVIDIA_API_KEY");
  const canDiscover =
    canSource &&
    ((isConfigured("INNGEST_EVENT_KEY") && isConfigured("INNGEST_SIGNING_KEY")) || isConfigured("INNGEST_DEV"));
  let discoverDisabledReason: string | undefined;
  if (!canSource) discoverDisabledReason = "Requires EXA and NVIDIA API keys in this environment.";
  else if (!canDiscover) discoverDisabledReason = "Requires Inngest keys (or INNGEST_DEV locally) to run discovery.";
  else if (activeDiscovery)
    discoverDisabledReason = `Discovery already running — open run ${activeDiscovery.id.slice(0, 8)}… on Pipeline or wait for it to finish.`;

  const qualified = (counts.needs_review ?? 0) + (counts.approved ?? 0) + (counts.hubspot_synced ?? 0);
  const highConfidence = counts.needs_review ?? 0; // proxy: queue is pre-scored ≥55
  const awaiting = counts.needs_review ?? 0;

  const metrics = [
    { label: "Upcoming signals", value: selected.length },
    { label: "Qualified leads", value: qualified },
    { label: "In review queue", value: highConfidence },
    { label: "Awaiting decision", value: awaiting },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Radar</h1>
          <p className="max-w-xl text-muted-foreground">Market signal radar — events, hiring, ERP change, and operational triggers in one view.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RefreshIntelligenceButton />
          <DiscoverEventsButton
            disabled={Boolean(activeDiscovery) || !canDiscover}
            disabledReason={discoverDisabledReason}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-xl border border-border/60 bg-card/40 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{m.label}</p>
            <p className="font-mono text-2xl font-semibold tabular-nums">{m.value}</p>
          </div>
        ))}
      </div>

      {activeDiscovery && (
        <div className="space-y-2">
          <RunProgress initial={toRunDto(activeDiscovery)} compact />
          <p className="text-[11px] text-muted-foreground">
            While discovery runs, use the <Link href="/radar?view=graph" className="text-sky-400 hover:underline">Graph</Link> view to watch market nodes appear after events are promoted.
          </p>
        </div>
      )}

      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading view…</p>}>
        <RadarViewTabs
          activeRunId={activeDiscovery?.id}
          table={<SignalRadar events={JSON.parse(JSON.stringify(selected))} />}
        />
      </Suspense>

      {(topAccounts.length > 0 || topOpps.length > 0) && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top opportunities</h2>
          <ol className="divide-y rounded-xl border border-border/60 bg-card/30">
            {topAccounts.map((a, i) => {
              const intel = a.accountIntelligence as { whyNow?: string; activeSignalCount?: number } | null;
              return (
                <li key={a.id}>
                  <Link href={`/accounts/${a.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-accent/30">
                    <span className="w-6 font-mono text-xs text-muted-foreground">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{intel?.whyNow ?? a.industry ?? "Account intelligence"}</p>
                      {intel?.activeSignalCount != null && intel.activeSignalCount > 0 && (
                        <p className="text-[11px] text-muted-foreground">{intel.activeSignalCount} active signal(s)</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-lg font-semibold tabular-nums">{a.accountPriority}</p>
                      <ScoreBadge score={a.companyFitScore} max={40} size="sm" />
                    </div>
                  </Link>
                </li>
              );
            })}
            {topAccounts.length === 0 &&
              topOpps.map((l, i) => (
                <li key={l.id}>
                  <Link href={`/leads?lead=${l.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-accent/30">
                    <span className="w-6 font-mono text-xs text-muted-foreground">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{l.person.fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.person.title ?? "Role unknown"} · {l.company?.name ?? "—"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {signalLabel(l.attendanceType)} · {l.event.name}
                      </p>
                    </div>
                    <div className="text-right">
                      <ScoreBadge score={l.totalScore} size="sm" />
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">P{l.priorityScore}</p>
                    </div>
                  </Link>
                </li>
              ))}
          </ol>
        </section>
      )}

      {recentSignals.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent signals</h2>
          <ul className="divide-y rounded-xl border border-border/60 bg-card/30">
            {recentSignals.map((s) => (
              <li key={s.id}>
                <Link href={`/accounts/${s.companyId}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-accent/30">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">{s.companyName}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.title}</p>
                  </div>
                  <span className="rounded-md border border-border/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {signalTypeLabel(s.type)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selected.length === 0 && !activeDiscovery && (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">No events on the Radar yet</p>
          <p className="mt-1 text-muted-foreground">Run discovery to find upcoming supply-chain, manufacturing, and operations events.</p>
        </div>
      )}

      {selected.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick actions</h2>
          <ul className="divide-y rounded-xl border border-border/60 bg-card/30">
            {selected.slice(0, 12).map((e) => {
              const active = e.latestRun && isActiveStatus(e.latestRun.status);
              return (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <Link href={`/events/${e.id}`} className="font-medium hover:underline">
                      {e.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {formatDateRange(e.startDate, e.endDate)} · {formatLocation(e)} · {e.leadCount} leads
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <ScoreBadge score={e.relevanceScore} size="sm" />
                    <SourceLeadsButton eventId={e.id} disabled={Boolean(active) || !canSource} label={e.leadCount > 0 ? "Refresh" : "Source leads"} variant="outline" />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {candidates.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Candidates · {candidates.length} not yet promoted
          </h2>
          <div className="divide-y rounded-xl border border-border/60 bg-card/20">
            {candidates.slice(0, 15).map((e) => (
              <Link key={e.id} href={`/events/${e.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-accent/30">
                <span className="truncate text-[13px]">{e.name}</span>
                <ScoreBadge score={e.relevanceScore} size="sm" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
