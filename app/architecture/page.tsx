import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { SCORING_VERSION, LEAD_QUALIFY_THRESHOLD } from "@/lib/scoring/config";

export const metadata: Metadata = { title: "Architecture" };

const STAGES = [
  { n: "A", name: "Discover events", how: "Exa neural search (12 queries, aggregators excluded) → AI extracts structured candidates → official site resolved and verified", tool: "Exa · Nemotron" },
  { n: "B", name: "Extract participants", how: "Official speaker / sponsor / exhibitor / agenda pages scraped; names accepted only if they literally appear in the page text", tool: "Firecrawl · Exa · Nemotron" },
  { n: "C", name: "Qualify companies", how: "Domain resolved, firmographics enriched, deterministic company-fit score", tool: "Exa · Apollo" },
  { n: "D", name: "Find people", how: "Named speakers + target personas at qualified companies; public role claims need a verbatim quote that is verified in the source", tool: "Apollo · Exa" },
  { n: "E", name: "Enrich / contact route", how: "Top candidates only. Apollo when the plan allows it; otherwise a public profile attached only after deterministic name, employer and current-role checks. No phone numbers, no guessed emails", tool: "Apollo · Exa" },
  { n: "F", name: "Score", how: `Pure TypeScript, version ${SCORING_VERSION}: company 40 + persona 30 + intent 30. Rerun-safe.`, tool: "Code" },
  { n: "G", name: "Explain", how: "Model writes a grounded explanation after the score is final; a guard rewrites any unsupported attendance claim", tool: "Nemotron" },
];

const GUARDRAILS = [
  ["The model never produces a number", "Lead score, event relevance and attendance confidence are computed in TypeScript from categorical ratings and evidence."],
  ["Inference is labelled as inference", "An exhibitor's employee is shown as Moderate: the company is listed, and personal attendance is not verified."],
  ["Evidence is built by code", "Snippets are cut from retrieved source text, hashed for dedupe, and stored with URL + retrieval time. The model cannot supply a citation."],
  ["Schema-validated AI", "Every model response is parsed with Zod; one repair retry, then the item is marked failed and the source data is kept."],
  ["Humans gate the CRM", `Only reviewed and approved leads (score ≥ ${LEAD_QUALIFY_THRESHOLD} to enter the queue) can be pushed to HubSpot; the upsert is idempotent and records every attempt.`],
  ["Failures are recorded, not hidden", "Rate limits, plan limits and provider errors are stored on the run and shown in the UI. Apollo plan limits degrade the pipeline visibly and switch it to verified public profiles."],
];

export default function ArchitecturePage() {
  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Architecture</h1>
        <p className="text-muted-foreground">One Next.js app on Vercel, one Neon Postgres database. No separate backend, queue or worker fleet.</p>
      </div>

      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          {["Browser (React UI)", "Next.js route handlers", "Resumable source_runs engine", "Neon Postgres"].map((x, i, a) => (
            <span key={x} className="flex items-center gap-2">
              <span className="rounded-md border bg-muted/50 px-2.5 py-1 font-medium">{x}</span>
              {i < a.length - 1 && <ArrowRight className="size-3.5 text-muted-foreground" />}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[13px] leading-6 text-muted-foreground">
          Long jobs are split into time-boxed batches (≈40s) with a DB lease, so they fit serverless limits. Progress and cursors persist in <code>source_runs</code>; the browser only polls Neon for progress.
          Each batch is a durable Inngest step with automatic retries; there is no cron, no queue server and no worker to run. Integrations: Exa, Firecrawl, Apollo, NVIDIA Nemotron (behind a provider-agnostic interface), HubSpot.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Event → company → person → lead</h2>
        <ol className="divide-y rounded-lg border bg-card">
          {STAGES.map((s) => (
            <li key={s.n} className="flex gap-3 px-4 py-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary font-mono text-xs text-primary-foreground">{s.n}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-[11px] text-muted-foreground">{s.tool}</span>
                </div>
                <p className="text-[13px] leading-5 text-muted-foreground">{s.how}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Trust guardrails</h2>
        <dl className="grid gap-3 md:grid-cols-2">
          {GUARDRAILS.map(([t, d]) => (
            <div key={t} className="rounded-lg border bg-card p-3">
              <dt className="font-medium">{t}</dt>
              <dd className="mt-1 text-[13px] leading-5 text-muted-foreground">{d}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Scoring model {SCORING_VERSION} (100 points)</h2>
        <ul className="grid gap-1 text-[13px] text-muted-foreground md:grid-cols-3">
          <li><b className="text-foreground">Company 40</b> — industry 16, size 10, operations 6, ERP 5, geography 3</li>
          <li><b className="text-foreground">Persona 30</b> — function 15, seniority 15</li>
          <li><b className="text-foreground">Intent 30</b> — attendance evidence 24, corroboration 3, event relevance 3</li>
        </ul>
      </section>
    </div>
  );
}
