import type { Metadata } from "next";
import Link from "next/link";
import { DiscoverEventsButton, RefreshIntelligenceButton, SourceLeadsButton } from "@/components/gtm/action-buttons";
import { RunProgress } from "@/components/gtm/run-progress";
import { ScoreBadge } from "@/components/gtm/badges";
import { GraphView } from "@/components/graph/graph-view";
import { MomentumChart } from "@/components/radar/momentum-chart";
import { ProductTour } from "@/components/onboarding/product-tour";
import { loadActivity } from "@/lib/analytics/activity";
import { loadDrivers } from "@/lib/analytics/drivers";
import { loadFunnel } from "@/lib/analytics/funnel";
import { loadMomentum } from "@/lib/analytics/momentum";
import { pickNextAction } from "@/lib/analytics/next-action";
import { listEvents } from "@/lib/db/queries/events";
import { listTopOpportunities, statusCounts } from "@/lib/db/queries/leads";
import { findActiveRun } from "@/lib/db/queries/runs";
import { toRunDto } from "@/lib/dto";
import { isConfigured } from "@/lib/env";
import { formatDateRange, formatRelative } from "@/lib/format";
import { isActiveStatus } from "@/lib/run-status";

export const metadata: Metadata = { title: "Radar" };
export const dynamic = "force-dynamic";

function daysAway(start: string | null, now: number): string | null {
  if (!start) return null;
  const d = Math.round((Date.parse(start) - now) / 86_400_000);
  if (Number.isNaN(d)) return null;
  if (d < 0) return "Event passed";
  if (d === 0) return "Today";
  return `${d} days away`;
}

function eventState(leadCount: number, researching: boolean): string {
  if (researching) return "Researching";
  if (leadCount > 0) return "Ready for review";
  return "Needs research";
}

export default async function RadarPage({ searchParams }: PageProps<"/radar">) {
  const sp = await searchParams;
  const range = sp.range === "7" || sp.range === "90" ? sp.range : "30";
  if (sp.view === "graph") {
    return (
      <div className="space-y-3">
        <Link href="/radar" className="text-xs text-muted-foreground hover:underline">← Back to Radar</Link>
        <h1 className="text-sm font-semibold">Explore relationships</h1>
        <p className="text-xs text-muted-foreground">Advanced view. Everyday scanning stays on Radar; use a lead’s “Why this opportunity” for a short trace.</p>
        <GraphView scope="market" minHeight={560} />
      </div>
    );
  }

  const [selected, activeDiscovery, counts, topOpps, series, drivers, funnel, activity] = await Promise.all([
    listEvents({ statuses: ["selected"] }),
    findActiveRun(null, "event_discovery"),
    statusCounts(),
    listTopOpportunities(6),
    loadMomentum(range),
    loadDrivers(Number(range)),
    loadFunnel(),
    loadActivity(8),
  ]);

  const canSource = isConfigured("EXA_API_KEY") && isConfigured("NVIDIA_API_KEY");
  const reviewReady = counts.needs_review ?? 0;
  const high = topOpps.filter((l) => l.priorityScore >= 80).length;
  const next = pickNextAction(
    topOpps.map((l) => ({
      id: l.id,
      priorityScore: l.priorityScore,
      personName: l.person.fullName,
      companyName: l.company?.name ?? null,
      title: l.person.title,
    })),
    selected.map((e) => ({ id: e.id, name: e.name, leadCount: e.leadCount, status: e.status })),
  );

  const now = Date.parse(new Date().toISOString());
  const rankedEvents = [...selected].sort((a, b) => {
    const da = a.startDate ? Math.max(1, (Date.parse(a.startDate) - now) / 86_400_000) : 90;
    const db = b.startDate ? Math.max(1, (Date.parse(b.startDate) - now) / 86_400_000) : 90;
    const sa = ((a.relevanceScore ?? 0) * (1 + a.leadCount)) / da;
    const sb = ((b.relevanceScore ?? 0) * (1 + b.leadCount)) / db;
    return sb - sa;
  });

  return (
    <div data-tour="radar" className="space-y-6">
      <ProductTour auto />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Radar</h1>
          <p className="max-w-xl text-sm text-muted-foreground">Your highest-value GTM signals, opportunities, and upcoming moments.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 text-[11px]">
            {(["7", "30", "90"] as const).map((r) => (
              <Link key={r} href={`/radar?range=${r}`} className={`rounded-md px-2 py-1 ${range === r ? "bg-accent" : "text-muted-foreground"}`}>
                {r}d
              </Link>
            ))}
          </div>
          <RefreshIntelligenceButton />
          <DiscoverEventsButton running={Boolean(activeDiscovery)} runId={activeDiscovery?.id} canStart={canSource} />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Review-ready", value: String(reviewReady) },
          { label: "High priority", value: String(high) },
          { label: `${range}-day momentum`, value: series.deltaPct == null ? "—" : `${series.deltaPct > 0 ? "+" : ""}${series.deltaPct}%` },
          { label: "Upcoming events", value: String(selected.length) },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-border/60 bg-card/40 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{m.label}</p>
            <p className="font-mono text-2xl font-semibold tabular-nums">{m.value}</p>
          </div>
        ))}
      </div>

      {activeDiscovery && <RunProgress initial={toRunDto(activeDiscovery)} compact />}

      {selected.length === 0 && topOpps.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">No market signals yet</p>
          <p data-tour="momentum" className="mt-1 text-sm text-muted-foreground">Start by discovering relevant events. Radar will rank them and identify the ones worth researching.</p>
          <span data-tour="drivers" className="sr-only">Drivers appear after opportunities exist.</span>
          <span data-tour="events" className="sr-only">Events appear after discovery.</span>
          <span data-tour="trace" className="sr-only">Trace lives on a lead.</span>
        </div>
      ) : (
        <>
          <MomentumChart series={series} />

          <section data-tour="drivers">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why momentum changed</h2>
            {drivers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No new review-ready opportunities in this window yet.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {drivers.map((d) => (
                  <li key={d.title}>
                    <Link href={d.href ?? "/radar"} className="block rounded-lg border border-border/60 px-3 py-2 hover:bg-accent/30">
                      <p className="text-sm font-medium">↑ +{d.contribution} · {d.title}</p>
                      <p className="text-xs text-muted-foreground">{d.detail}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top opportunities</h2>
              {topOpps.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No review-ready opportunities yet. Research an event to surface people.</p>
              ) : (
                <ol className="divide-y rounded-xl border border-border/60">
                  {topOpps.map((l, i) => (
                    <li key={l.id}>
                      <Link href={`/leads?lead=${l.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/30">
                        <span className="w-5 font-mono text-xs text-muted-foreground">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{l.person.fullName}</p>
                          <p className="truncate text-xs text-muted-foreground">{l.person.title ?? "Role unknown"} · {l.company?.name ?? "—"}</p>
                        </div>
                        <ScoreBadge score={l.priorityScore} size="sm" />
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Funnel</h2>
              <ol className="space-y-1 rounded-xl border border-border/60 p-3 text-sm">
                {funnel.stages.map((s) => (
                  <li key={s.key} className="flex justify-between gap-2">
                    {s.href ? (
                      <Link href={s.href} className="hover:underline">{s.label}</Link>
                    ) : (
                      <span>{s.label}</span>
                    )}
                    <span className="font-mono tabular-nums">{s.count}</span>
                  </li>
                ))}
              </ol>
              {funnel.dropoff && <p className="mt-2 text-xs text-muted-foreground">{funnel.dropoff}</p>}
            </section>
          </div>

          <section id="tour-next" className="rounded-xl border border-sky-400/30 bg-sky-400/5 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Next best action</p>
            <p className="mt-1 font-medium">{next.title}</p>
            <p className="text-sm text-muted-foreground">{next.detail}</p>
            <Link href={next.href} className="mt-2 inline-block text-sm text-sky-400 hover:underline">{next.cta} →</Link>
          </section>

          <section data-tour="events" className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upcoming events</h2>
            {rankedEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events on Radar yet.</p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {rankedEvents.slice(0, 6).map((e) => {
                  const researching = Boolean(e.latestRun && isActiveStatus(e.latestRun.status));
                  return (
                    <li key={e.id} className="rounded-xl border border-border/60 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Link href={`/events/${e.id}`} className="font-semibold hover:underline">{e.name}</Link>
                          <p className="text-xs text-muted-foreground">
                            {formatDateRange(e.startDate, e.endDate)}
                            {daysAway(e.startDate, now) ? ` · ${daysAway(e.startDate, now)}` : ""}
                          </p>
                        </div>
                        <ScoreBadge score={e.relevanceScore} size="sm" />
                      </div>
                      <p className="mt-2 text-sm leading-relaxed">{e.relevanceReason ?? "Relevance is scored after official pages are gathered."}</p>
                      {e.targetPersonas.length > 0 && (
                        <p className="mt-2 text-xs text-muted-foreground">Functions · {e.targetPersonas.slice(0, 4).join(" · ")}</p>
                      )}
                      <p className="mt-2 text-xs">{eventState(e.leadCount, researching)} · {e.leadCount} people found</p>
                      <div className="mt-3 flex items-center gap-2">
                        <Link href={`/events/${e.id}`} className="text-xs text-sky-400 hover:underline">Open event</Link>
                        <SourceLeadsButton eventId={e.id} disabled={researching || !canSource} label={e.leadCount > 0 ? "Refresh" : "Research event"} variant="outline" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent activity</h2>
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">Activity will appear as signals, research, and reviews happen.</p>
            ) : (
              <ul className="divide-y rounded-xl border border-border/60">
                {activity.map((a) => (
                  <li key={a.id}>
                    <Link href={a.href ?? "/radar"} className="block px-3 py-2 hover:bg-accent/30">
                      <p className="text-sm font-medium">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{a.description} · {formatRelative(a.occurredAt)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-[11px] text-muted-foreground">
            <span data-tour="trace">Need the relationship chain for one record? Open a lead and use Why this opportunity, or{" "}</span>
            <Link href="/radar?view=graph" className="underline">explore relationships</Link> (advanced).
          </p>
        </>
      )}
    </div>
  );
}
