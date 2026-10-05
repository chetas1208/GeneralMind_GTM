import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ExternalLink, MapPin } from "lucide-react";
import { EventStatusButtons, SourceLeadsButton } from "@/components/gtm/action-buttons";
import { EventTabBar, parseEventTab } from "@/components/events/event-tab-bar";
import { ScoreBadge, StatusPill, Tag } from "@/components/gtm/badges";
import { signalLabel } from "@/lib/gtm-present";
import { EditEventSheet } from "@/components/gtm/edit-event";
import { isActiveStatus } from "@/lib/run-status";
import { RunProgress } from "@/components/gtm/run-progress";
import { SectionBreakdown } from "@/components/gtm/score-breakdown";
import { listEventCompanies } from "@/lib/db/queries/companies";
import { getEvent, listEventSources } from "@/lib/db/queries/events";
import { listLeads } from "@/lib/db/queries/leads";
import { listRunsForEvent } from "@/lib/db/queries/runs";
import { toRunDto } from "@/lib/dto";
import { formatDateRange, formatLocation, formatRelative, humanize } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/events/[id]">): Promise<Metadata> {
  const { id } = await params;
  const event = /^[0-9a-f-]{36}$/i.test(id) ? await getEvent(id) : null;
  return { title: event?.name ?? "Event" };
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function EventPage({ params, searchParams }: PageProps<"/events/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = parseEventTab(one(sp.tab));
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const event = await getEvent(id);
  if (!event) notFound();

  const [companies, sources, leads, runs] = await Promise.all([
    listEventCompanies(id),
    listEventSources(id),
    listLeads({ eventId: id, sort: "score", limit: 200 }),
    listRunsForEvent(id, 5),
  ]);
  const sourcingRuns = runs.filter((r) => r.kind === "lead_sourcing");
  const activeRun = sourcingRuns.find((r) => isActiveStatus(r.status));
  const lastRun = activeRun ?? sourcingRuns[0];

  const speakers = leads.items.filter((l) => l.attendanceType === "official_speaker");
  const byAssoc = (t: string) => companies.filter((c) => c.associations.some((a) => a.type === t));
  const sponsors = byAssoc("sponsor");
  const exhibitors = byAssoc("exhibitor");
  const breakdown = event.assessment?.breakdown;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link href="/radar" className="hover:text-foreground">Radar</Link>
            <span>/</span>
            <StatusPill status={event.status} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">{event.name}</h1>
            {event.relevanceScore != null && (
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <ScoreBadge score={event.relevanceScore} size="sm" />
                {event.relevanceScore >= 75 ? "Strong fit" : event.relevanceScore >= 55 ? "Moderate fit" : "Low fit"}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" />{formatDateRange(event.startDate, event.endDate)}</span>
            <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" />{[event.venue, formatLocation(event)].filter(Boolean).join(" · ")}</span>
            {event.websiteUrl && (
              <a href={event.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                Official site <ExternalLink className="size-3" />
              </a>
            )}
            {event.registrationUrl && (
              <a href={event.registrationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                Registration <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <EventStatusButtons eventId={event.id} status={event.status} />
          <EditEventSheet event={event} />
          <SourceLeadsButton eventId={event.id} disabled={Boolean(activeRun)} label={leads.total > 0 ? "Re-run sourcing" : "Source Leads"} />
        </div>
      </div>

      {activeRun ? (
        <RunProgress initial={toRunDto(activeRun)} />
      ) : lastRun ? (
        <details className="rounded-lg border bg-card">
          <summary className="flex cursor-pointer items-center justify-between px-4 py-2.5">
            <span className="font-medium">
              Last sourcing run · <span className="font-normal text-muted-foreground">{lastRun.status} {formatRelative(lastRun.completedAt ?? lastRun.createdAt)}</span>
            </span>
            <span className="text-xs text-muted-foreground">{lastRun.companiesFound} companies · {lastRun.peopleFound} people · {lastRun.leadsQualified} to review</span>
          </summary>
          <div className="border-t p-3">
            <RunProgress initial={toRunDto(lastRun)} compact />
          </div>
        </details>
      ) : null}

      <EventTabBar eventId={event.id} active={tab} />

      {tab === "overview" && (
        <div className="space-y-6">
          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">Why GeneralMind cares</h2>
            <p className="leading-6">{event.relevanceReason ?? "Relevance is assessed after official participant pages are gathered."}</p>
            {event.description && <p className="mt-3 border-t pt-3 text-muted-foreground">{event.description}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[...event.industryTags.slice(0, 6), ...event.audienceTags.slice(0, 4)].map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </div>
            {event.agendaThemes.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Agenda themes · </span>
                {event.agendaThemes.slice(0, 8).join(" · ")}
              </p>
            )}
            {event.targetPersonas.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Target functions · </span>
                {event.targetPersonas.join(" · ")}
              </p>
            )}
            {breakdown && (
              <div className="mt-4 border-t pt-3">
                <SectionBreakdown title="Fit breakdown" section={breakdown} />
              </div>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">
                Qualified leads <span className="font-normal text-muted-foreground">· {leads.total}</span>
              </h2>
              {leads.total > 0 && (
                <Link href={`/leads?event=${event.id}`} className="text-xs text-muted-foreground hover:text-foreground">
                  Open workbench →
                </Link>
              )}
            </div>
            {leads.items.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-card p-6 text-center text-muted-foreground">
                No qualified leads yet. Use <strong>Source leads</strong> to discover companies, verify evidence, and score decision-makers.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full min-w-[640px] text-left">
                  <thead className="border-b bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Score</th>
                      <th className="px-3 py-2 font-medium">Person</th>
                      <th className="px-3 py-2 font-medium">Signal</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {leads.items.slice(0, 12).map((l) => (
                      <tr key={l.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2">
                          <ScoreBadge score={l.totalScore} size="sm" />
                        </td>
                        <td className="px-3 py-2">
                          <Link href={`/leads?event=${event.id}&lead=${l.id}`} className="font-medium hover:underline">
                            {l.person.fullName}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {l.person.title ?? "Role unknown"} · {l.company?.name ?? "—"}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{signalLabel(l.attendanceType)}</td>
                        <td className="px-3 py-2">
                          <StatusPill status={l.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "companies" && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">
            Companies <span className="font-normal text-muted-foreground">· {companies.length}</span>
          </h2>
          {companies.length === 0 ? (
            <p className="rounded-lg border border-dashed bg-card p-4 text-muted-foreground">No companies discovered yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full min-w-[620px] text-left">
                <thead className="border-b bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Company</th>
                    <th className="px-3 py-2 font-medium">Event role</th>
                    <th className="px-3 py-2 font-medium">Industry</th>
                    <th className="px-3 py-2 text-right font-medium">Employees</th>
                    <th className="px-3 py-2 text-right font-medium">Fit /40</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {companies.map((c) => (
                    <tr key={c.companyId}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{c.name}</div>
                        {c.domain && <div className="text-xs text-muted-foreground">{c.domain}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {[...new Set(c.associations.map((a) => a.type))].map((t) => (
                            <Tag key={t}>{humanize(t)}</Tag>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{c.industry ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.employeeCount?.toLocaleString("en-US") ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <ScoreBadge score={c.companyFitScore} max={40} size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "people" && (
        <section className="grid gap-4 md:grid-cols-3">
          <ParticipantList
            title="Speakers"
            empty="No speakers discovered yet"
            items={speakers.map((s) => ({
              key: s.id,
              primary: s.person.fullName,
              secondary: `${s.person.title ?? ""}${s.company ? ` · ${s.company.name}` : ""}`,
              href: `/leads?event=${event.id}&lead=${s.id}`,
            }))}
          />
          <ParticipantList title="Sponsors" empty="No sponsors discovered yet" items={sponsors.map((c) => ({ key: c.companyId, primary: c.name, secondary: c.industry ?? undefined }))} />
          <ParticipantList title="Exhibitors" empty="No exhibitors discovered yet" items={exhibitors.map((c) => ({ key: c.companyId, primary: c.name, secondary: c.industry ?? undefined }))} />
        </section>
      )}

      {tab === "evidence" && (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">
            Preserved sources <span className="font-normal text-muted-foreground">· {sources.length}</span>
          </h2>
          {sources.length === 0 ? (
            <p className="text-muted-foreground">No public sources preserved for this event yet.</p>
          ) : (
            <ul className="space-y-3">
              {sources.map((s) => (
                <li key={s.id} className="text-sm">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline" title={s.url}>
                    {s.title ?? s.url}
                  </a>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Tag>{humanize(s.kind)}</Tag>
                    <span>Updated {formatRelative(s.retrievedAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function ParticipantList({ title, items, empty }: { title: string; empty: string; items: { key: string; primary: string; secondary?: string; href?: string }[] }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-3 py-2 text-sm font-semibold">
        {title} <span className="font-normal text-muted-foreground">· {items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="p-3 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="max-h-64 divide-y overflow-y-auto">
          {items.slice(0, 40).map((i) => (
            <li key={i.key} className="px-3 py-1.5">
              {i.href ? <Link href={i.href} className="font-medium hover:underline">{i.primary}</Link> : <span className="font-medium">{i.primary}</span>}
              {i.secondary && <div className="text-xs text-muted-foreground">{i.secondary}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
