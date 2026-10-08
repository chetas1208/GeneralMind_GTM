import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SignalTimeline } from "@/components/accounts/signal-timeline";
import { RefreshAccountButton } from "@/components/gtm/action-buttons";
import { ScoreBadge } from "@/components/gtm/badges";
import { MetricInfo } from "@/components/ui/metric-info";
import { fitBand } from "@/lib/confidence";
import { listClustersForCompany, listSignalsForCompany } from "@/lib/db/queries/signals";
import { getCompany, listCompanyEventLinks } from "@/lib/db/queries/companies";
import { listLeadsForCompany } from "@/lib/db/queries/leads";
import { loadAccountActivity } from "@/lib/analytics/activity";
import { listPeopleForCompany } from "@/lib/db/queries/people";
import { workflowLabel } from "@/lib/icp/workflows";
import { formatRelative } from "@/lib/format";
import type { WorkflowType } from "@/lib/icp/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/accounts/[id]">): Promise<Metadata> {
  const { id } = await params;
  const c = /^[0-9a-f-]{36}$/i.test(id) ? await getCompany(id) : null;
  return { title: c?.name ?? "Account" };
}

export default async function AccountPage({ params, searchParams }: PageProps<"/accounts/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab === "activity" ? "activity" : "overview";
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const company = await getCompany(id);
  if (!company) notFound();

  const [signalRows, clusters, people, leads, eventLinks, activity] = await Promise.all([
    listSignalsForCompany(id),
    listClustersForCompany(id),
    listPeopleForCompany(id),
    listLeadsForCompany(id),
    listCompanyEventLinks(id),
    loadAccountActivity(id),
  ]);

  const intel = company.accountIntelligence;
  const verifiedSignals = signalRows.filter((s) => s.status === "verified");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/radar" className="text-xs text-muted-foreground hover:text-foreground">
            ← Radar
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{company.name}</h1>
          <p className="text-sm text-muted-foreground">
            {[company.industry, company.employeeCount ? `~${company.employeeCount.toLocaleString()} employees` : null, company.headquarters]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="inline-flex items-center justify-end gap-1 text-[10px] uppercase text-muted-foreground">
              Priority <MetricInfo metric="priority" internal={company.accountPriority ? company.accountPriority / 100 : null} />
            </p>
            <p className="font-mono text-2xl font-semibold tabular-nums">{company.accountPriority || "—"}</p>
          </div>
          <div className="text-right">
            <p className="inline-flex items-center justify-end gap-1 text-[10px] uppercase text-muted-foreground">
              Company Fit <MetricInfo metric="companyFit" internal={company.companyFitScore ? company.companyFitScore / 40 : null} />
            </p>
            <div className="mt-1 flex justify-end">
              <ScoreBadge score={company.companyFitScore} max={40} size="lg" band={company.companyFitScore == null ? null : fitBand(company.companyFitScore, 40)} />
            </div>
          </div>
          <RefreshAccountButton companyId={id} />
        </div>
      </div>

      <nav className="flex gap-1 border-b border-border/60 text-sm" aria-label="Account sections">
        <Link href={`/accounts/${id}`} className={`-mb-px border-b-2 px-3 py-2 ${tab === "overview" ? "border-primary" : "border-transparent text-muted-foreground"}`}>
          Overview
        </Link>
        <Link href={`/accounts/${id}?tab=activity`} className={`-mb-px border-b-2 px-3 py-2 ${tab === "activity" ? "border-primary" : "border-transparent text-muted-foreground"}`}>
          Activity
        </Link>
        <Link href={`/radar?view=graph&scope=company&entityId=${id}`} className="-mb-px border-b-2 border-transparent px-3 py-2 text-muted-foreground">
          Trace
        </Link>
      </nav>

      {tab === "activity" ? (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity</h2>
          {activity.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No signals or reviews on this account yet.</p>
          ) : (
            <ul className="divide-y rounded-xl border border-border/60">
              {activity.map((a) => (
                <li key={a.id}>
                  <Link href={a.href ?? `/accounts/${id}`} className="block px-3 py-2 hover:bg-accent/30">
                    <p className="text-sm font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.description} · {formatRelative(a.occurredAt)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
      <>
      {intel?.whyNow && (
        <section className="rounded-xl border bg-card/40 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why now</h2>
          <p className="mt-2 leading-relaxed">{intel.whyNow}</p>
          {intel.whyGeneralMind && <p className="mt-2 text-sm text-muted-foreground">{intel.whyGeneralMind}</p>}
          {intel.discoveryAngle && (
            <p className="mt-3 border-t border-border/60 pt-3 text-sm">
              <span className="font-medium">Discovery angle · </span>
              {intel.discoveryAngle}
            </p>
          )}
          {company.intelligenceUpdatedAt && (
            <p className="mt-2 text-[11px] text-muted-foreground">Intelligence updated {formatRelative(company.intelligenceUpdatedAt)}</p>
          )}
        </section>
      )}

      {clusters.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Likely opportunities</h2>
          <ul className="flex flex-wrap gap-2">
            {clusters.slice(0, 6).map((c) => (
              <li key={c.id} className="rounded-lg border border-border/60 px-3 py-2 text-[12px]">
                <span className="font-medium capitalize">{workflowLabel(c.workflow as WorkflowType)}</span>
                <span className="ml-2 font-mono text-muted-foreground">strength {c.strength}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Signal timeline</h2>
          <SignalTimeline items={verifiedSignals} />
        </div>
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Relevant people</h2>
          <ul className="divide-y rounded-xl border border-border/60">
            {people.slice(0, 8).map((p) => (
              <li key={p.id} className="px-3 py-2">
                <Link href={`/leads?q=${encodeURIComponent(p.fullName)}`} className="font-medium hover:underline">
                  {p.fullName}
                </Link>
                <p className="text-xs text-muted-foreground">{p.title ?? "—"}</p>
              </li>
            ))}
            {people.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">No contacts discovered yet.</li>}
          </ul>
          {leads.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Opportunities</h2>
              <ul className="divide-y rounded-xl border border-border/60">
                {leads.slice(0, 6).map((l) => (
                  <li key={l.id} className="px-3 py-2">
                    <Link href={`/leads?lead=${l.id}`} className="text-[13px] font-medium hover:underline">
                      {l.person.fullName}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      Score {l.totalScore} · P{l.priorityScore}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
          {eventLinks.length > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">{eventLinks.length} event participation record(s) in graph.</p>
          )}
        </div>
      </section>
      </>
      )}
    </div>
  );
}
