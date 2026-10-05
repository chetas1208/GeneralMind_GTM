"use client";

import { FindContactRoute } from "@/components/leads/find-contact-route";
import Link from "next/link";
import { CheckCircle2, ExternalLink, HelpCircle } from "lucide-react";
import { ScoreBadge } from "@/components/gtm/badges";
import { ReviewPanel } from "@/components/gtm/review-actions";
import { SectionBreakdown, type ScoreSection } from "@/components/gtm/score-breakdown";
import {
  activityLabel,
  confidencePresentation,
  evidenceSourceLabel,
  evidenceStrength,
  leadStatusLabel,
  signalLabel,
} from "@/lib/gtm-present";
import { formatDateRange, formatRelative, humanize } from "@/lib/format";
import { ATTENDANCE_LABEL, CONFIRMED_ATTENDANCE } from "@/lib/scoring/config";
import { ProvenancePath } from "@/components/leads/provenance-path";
import { workflowLabel } from "@/lib/icp/workflows";
import { cn } from "@/lib/utils";
import { safeHref } from "@/lib/safe-url";

export type LeadDetailDto = {
  lead: {
    id: string;
    status: string;
    totalScore: number;
    attendanceType: string;
    attendanceConfidence: number;
    qualificationReason: string | null;
    qualificationDetail: {
      whyCompanyFits: string;
      whyPersonMatters: string;
      eventLink: string;
      uncertainty: string;
      nextStep: string;
    } | null;
    aiStatus: string;
    aiError: string | null;
    priorityScore: number;
    signalFrequency: number;
    opportunityHypothesis: {
      workflows: string[];
      rationale: string;
      classification: string;
      confidence: number;
    } | null;
    scoreBreakdown: {
      version: string;
      company: ScoreSection;
      persona: ScoreSection;
      intent: ScoreSection;
    } | null;
  };
  person: {
    fullName: string;
    title: string | null;
    email: string | null;
    emailStatus: string | null;
    linkedinUrl: string | null;
    persona: string | null;
    seniority: string | null;
    location: string | null;
    enrichedAt: string | null;
  };
  company: {
    name: string;
    domain: string | null;
    industry: string | null;
    employeeCount: number | null;
    headquarters: string | null;
    estimatedRevenue: number | null;
    erpSignals: string[];
    operationalSignals: string[];
    description: string | null;
    enrichmentError: string | null;
  } | null;
  event: { id: string; name: string; startDate: string | null; endDate: string | null };
  evidence: {
    id: string;
    sourceType: string;
    confidence: number;
    evidenceText: string;
    sourceUrl: string | null;
    sourceTitle: string | null;
    retrievedAt: string;
  }[];
  reviews: { id: string; action: string; reason: string | null; notes: string | null; createdAt: string }[];
  syncs: {
    status: string;
    hubspotContactId: string | null;
    hubspotCompanyId: string | null;
    error: string | null;
    syncedAt: string | null;
    createdAt: string;
  }[];
};

const PERSON_LEVEL = new Set(["official_speaker", "agenda", "official_attendee", "person_announcement", "enrichment"]);

export function LeadDetailView({
  detail,
  crmConfigured,
  approved,
  compact = false,
}: {
  detail: LeadDetailDto;
  crmConfigured: boolean;
  approved: boolean;
  compact?: boolean;
}) {
  const { lead, person, company, event, evidence, reviews, syncs } = detail;
  const confirmed = CONFIRMED_ATTENDANCE.has(lead.attendanceType as never);
  const conf = confidencePresentation(lead.attendanceType, lead.attendanceConfidence);
  const latestSync = syncs[0] ?? null;
  const qual = lead.qualificationDetail;
  const breakdown = lead.scoreBreakdown;

  return (
    <div className={cn("space-y-4", compact && "text-[13px]")}>
      <header className="space-y-1 border-b border-border/60 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">{person.fullName}</h2>
            <p className="text-muted-foreground">{person.title ?? "Role unknown"}</p>
            <p className="font-medium">{company?.name ?? "Unknown company"}</p>
          </div>
          <ScoreBadge score={lead.totalScore} size="lg" />
        </div>
        <p className="text-xs text-muted-foreground">
          {signalLabel(lead.attendanceType)} ·{" "}
          <Link href={`/events/${event.id}`} className="hover:text-foreground hover:underline">
            {event.name}
          </Link>
          {event.startDate && ` · ${formatDateRange(event.startDate, event.endDate)}`}
        </p>
        <p className="text-xs">
          <span className={cn("font-medium", conf.tier === "Confirmed" ? "text-emerald-400" : "text-amber-400/90")}>
            {conf.tier}
          </span>
          <span className="text-muted-foreground"> · {conf.detail}</span>
          <span className="ml-2 text-muted-foreground">· {leadStatusLabel(lead.status)}</span>
        </p>
      </header>

      <ProvenancePath
        personName={person.fullName}
        personTitle={person.title}
        companyName={company?.name ?? null}
        eventName={event.name}
        attendanceType={lead.attendanceType}
        topEvidenceType={evidence[0]?.sourceType}
      />

      {lead.opportunityHypothesis && lead.opportunityHypothesis.workflows.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Likely GeneralMind opportunity</h3>
          <p className="text-[13px] leading-relaxed text-muted-foreground">{lead.opportunityHypothesis.rationale}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            {lead.opportunityHypothesis.workflows.slice(0, 6).map((w) => (
              <li key={w} className="rounded-md border border-border/60 px-2 py-0.5 capitalize">
                {workflowLabel(w as import("@/lib/icp/types").WorkflowType)}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {lead.opportunityHypothesis.classification === "evidence_backed" ? "Evidence-backed" : lead.opportunityHypothesis.classification === "strong_inference" ? "Strong inference" : "Speculative"} · priority {lead.priorityScore}
            {lead.signalFrequency > 1 ? ` · seen on ${lead.signalFrequency} relevant events` : ""}
          </p>
        </section>
      )}

      <section className={cn("rounded-lg border p-3", confirmed ? "border-emerald-900/40 bg-emerald-950/20" : "border-amber-900/30 bg-amber-950/15")}>
        <p className="leading-relaxed text-muted-foreground">
          {confirmed
            ? `${person.fullName} is linked to this event as ${ATTENDANCE_LABEL[lead.attendanceType as keyof typeof ATTENDANCE_LABEL] ?? lead.attendanceType}. Evidence below supports the connection.`
            : `${person.fullName}'s personal attendance is not confirmed. Evidence shows ${company?.name ?? "the company"}'s relationship to the event, not that this individual will attend.`}
        </p>
      </section>

      {(lead.qualificationReason || qual) && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why this lead</h3>
          {lead.qualificationReason && <p className="leading-relaxed">{lead.qualificationReason}</p>}
          {qual && (
            <dl className="mt-3 space-y-2 text-[13px]">
              <div>
                <dt className="text-muted-foreground">Company</dt>
                <dd>{qual.whyCompanyFits}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Person</dt>
                <dd>{qual.whyPersonMatters}</dd>
              </div>
              {qual.uncertainty && (
                <div>
                  <dt className="text-muted-foreground">Uncertain</dt>
                  <dd>{qual.uncertainty}</dd>
                </div>
              )}
            </dl>
          )}
        </section>
      )}

      {breakdown && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Score</h3>
          <div className="space-y-2 rounded-lg border bg-card/50 p-3 font-mono text-[12px] tabular-nums">
            <Row label="Company fit" value={breakdown.company.total} max={breakdown.company.max} />
            <Row label="Person fit" value={breakdown.persona.total} max={breakdown.persona.max} />
            <Row label="Intent" value={breakdown.intent.total} max={breakdown.intent.max} />
            <div className="border-t border-border/60 pt-2 font-semibold">
              Total {lead.totalScore} / 100
            </div>
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-muted-foreground">Why these points?</summary>
            <div className="mt-2 space-y-3">
              <SectionBreakdown title="Company" section={breakdown.company} />
              <SectionBreakdown title="Person" section={breakdown.persona} />
              <SectionBreakdown title="Intent" section={breakdown.intent} />
            </div>
          </details>
        </section>
      )}

      <section id="evidence">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence · {evidence.length}</h3>
        <ul className="space-y-2">
          {evidence.map((e) => (
            <li key={e.id} className="rounded-lg border bg-card/40 p-3">
              <div className="flex items-start gap-2">
                {PERSON_LEVEL.has(e.sourceType) ? (
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                ) : (
                  <HelpCircle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{evidenceSourceLabel(e.sourceType)}</span>
                    <span className="text-[11px] text-muted-foreground">{evidenceStrength(e.confidence)}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{e.evidenceText}</p>
                  {e.sourceUrl && (
                    <a href={safeHref(e.sourceUrl) ?? undefined} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-sky-400 hover:underline">
                      Open source <ExternalLink className="size-3" />
                    </a>
                  )}
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Updated {formatRelative(new Date(e.retrievedAt))}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact route</h3>
        <dl className="space-y-1 text-[13px]">
          <dt className="text-muted-foreground">Work email</dt>
          <dd>
            {person.email ?? <span className="text-muted-foreground">Not available — never guessed</span>}
          </dd>
          <dt className="text-muted-foreground">Public profile</dt>
          <dd>
            {person.linkedinUrl ? (
              <>
                <a href={safeHref(person.linkedinUrl) ?? undefined} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">
                  LinkedIn
                </a>
                <span className="ml-2 text-[11px] text-muted-foreground">verified against the profile text</span>
              </>
            ) : (
              <>
                <span className="text-muted-foreground">Not found yet</span>
                <FindContactRoute leadId={lead.id} />
              </>
            )}
          </dd>
          {person.location && (
            <>
              <dt className="text-muted-foreground">Location</dt>
              <dd>{person.location}</dd>
            </>
          )}
          {person.seniority && (
            <>
              <dt className="text-muted-foreground">Seniority</dt>
              <dd>{humanize(person.seniority)}</dd>
            </>
          )}
        </dl>
      </section>

      {company && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{company.name}</h3>
          <p className="text-muted-foreground">
            {[company.industry, company.employeeCount ? `~${company.employeeCount.toLocaleString()} employees` : null, company.headquarters]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {(company.erpSignals.length > 0 || company.operationalSignals.length > 0) && (
            <p className="mt-2 text-[12px] text-muted-foreground">
              <span className="text-foreground/80">Operational signals · </span>
              {[...company.erpSignals.slice(0, 4), ...company.operationalSignals.slice(0, 4)].join(" · ")}
            </p>
          )}
        </section>
      )}

      <ReviewPanel
        leadId={lead.id}
        status={lead.status}
        approved={approved}
        hubspotConfigured={crmConfigured}
        person={{ title: person.title, email: person.email }}
        sync={latestSync ? JSON.parse(JSON.stringify(latestSync)) : null}
      />

      {reviews.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity</h3>
          <ul className="space-y-2 text-[12px]">
            {reviews.map((r) => (
              <li key={r.id} className="flex justify-between gap-2">
                <span>
                  {activityLabel(r.action)}
                  {r.reason && !r.reason.includes("title") && ` · ${humanize(r.reason)}`}
                  {r.notes && <span className="block text-muted-foreground">{r.notes}</span>}
                </span>
                <span className="shrink-0 text-muted-foreground">{formatRelative(new Date(r.createdAt))}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!compact && (
        <p className="text-center text-[11px] text-muted-foreground">
          <Link href={`/leads/${lead.id}`} className="hover:underline">
            Open full page
          </Link>
        </p>
      )}
    </div>
  );
}

function Row({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span>
        {value} / {max}
      </span>
    </div>
  );
}
