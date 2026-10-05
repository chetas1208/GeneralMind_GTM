# GeneralMind GTM Radar

Evidence-backed go-to-market intelligence for **GeneralMind**: find when operationally complex enterprises enter moments where coordination across procurement, supply chain, finance, and order operations may matter—and route only qualified opportunities to human review and HubSpot.

This case study began with **events** (timing, persona, physical availability). The reusable architecture is **market signals**: events are one adapter among hiring, ERP transformation, executive change, expansion, and operational initiatives.

```
MARKET SIGNAL → ACCOUNT → PERSON → EVIDENCE → QUALIFICATION → HUMAN REVIEW → CRM
```

The event pipeline remains first-class:

```
EVENT → COMPANY → PERSON → EVIDENCE → SCORE → REVIEW → HUBSPOT
```

One Next.js application on Vercel, one Neon Postgres database, durable background work via Inngest. No Python, no microservices, no graph DB, **no GitHub Actions**, **no Vercel Cron**.

---

## What the product answers

| Question | Where |
| --- | --- |
| What is happening in the market? | **Radar** — events, recent signals, top accounts |
| Which accounts matter right now? | Account priority + **Top opportunities** |
| Why now? | Account intelligence (`whyNow`, signal timeline) |
| Who should we contact? | Leads queue + relevant people on account pages |
| What workflow should we discuss? | Signal clusters + ICP workflow hints |
| What evidence supports that? | Lead evidence, signal `sourceUrl`, provenance chain |
| What should we do next? | Approve / reject → HubSpot |

### Primary routes

| Route | Purpose |
| --- | --- |
| `/radar` | Market signal radar: upcoming events, top opportunities, recent signals, refresh intelligence |
| `/accounts/[id]` | Account intelligence: fit, priority, why now, signal timeline, clusters, people |
| `/leads` | Human review queue with filters |
| `/leads/[id]` | Score breakdown, attendance labelling, evidence, approve/reject, HubSpot |
| `/pipeline` | Review state and run activity |
| `/events/[id]` | Event detail, sourcing, participants, companies |
| `/system` | Integration health + signal engine stats (dev/diagnostics) |
| `/architecture` | One-page system overview |

Navigation stays focused: **Radar · Leads · Pipeline** (no engineering clutter in the main shell).

---

## Trust and provenance

- **Numbers are deterministic.** Lead scores, event relevance, attendance confidence, and account priority are computed in TypeScript (`lib/scoring`, `lib/icp`, `lib/signals/scoring`). Models supply categorization and prose *after* scores are fixed.
- **Inference is labelled.** Exhibitor employees are not “confirmed attendees” without primary evidence. Unsupported attendance claims are guarded in post-processing.
- **Evidence is built by code.** Snippets are cut from retrieved text, hashed, stored with URL and retrieval time. AI outputs that cite evidence must reference internal IDs present in context.
- **Signals are not opinions.** A signal is a verified external observation with source URL, confidence, relevance, and urgency—separate dimensions.
- **Human gate.** HubSpot push only after approval; sync is idempotent and logged.
- **Secrets stay server-side.** Keys live in Vercel environment variables, never in Git.

Provenance chain:

```
OPPORTUNITY (event lead / account priority)
  → SIGNAL CLUSTER
    → SIGNAL
      → EVIDENCE
        → SOURCE URL
```

---

## Scoring

### Event leads (`icp-v2`, 100 points)

| Section | Max | Role |
| --- | --- | --- |
| Company fit | 40 | Industry, size, complexity, ERP/workflow signals, geography |
| Persona fit | 30 | Function + seniority vs GeneralMind buyers |
| Event intent | 30 | Attendance evidence, corroboration, event relevance |

Leads at or above the review threshold enter the queue. **Priority score** (0–100) combines fit with timing (event proximity, signal frequency, contactability).

### Account priority (signal engine)

| Component | Max | Role |
| --- | --- | --- |
| Account fit | 30 | ICP company fit |
| Persona fit | 20 | Best known buyer match |
| Signal strength | 20 | Verified signals with freshness decay |
| Evidence confidence | 10 | High-confidence sources |
| Urgency | 10 | Event dates, hiring, transformation timing |
| Signal stacking | 5 | Bounded bonus for diverse aligned signals (not syndication copies) |
| Contactability | 5 | Verified work email (never outweighs fit) |

Negative signals reduce priority; fit and priority can diverge (strong fit, quiet market vs moderate fit with transformation triggers).

---

## Signal engine (Campaign 05)

Extensible **`SignalAdapter`** interface under `lib/signals/`:

| Adapter | Signal types |
| --- | --- |
| Event | Conference participation, confirmed speakers/attendees |
| Hiring | Procurement, supply chain, ERP, AP, automation roles |
| ERP | S/4HANA, Oracle, Dynamics, modernization (stage-aware) |
| Executive change | CPO, COO, CIO, VP Ops, transformation leaders |
| Expansion | Plants, DCs, geography, capacity |
| Operational initiative | Transformation programs from public announcements |

Pipeline per candidate: **discover → normalize → verify → classify → persist → cluster → account intelligence**.

Event sourcing automatically syncs **event signals** for companies in the graph. **Refresh intelligence** (Radar or `/api/intelligence/refresh`) runs Exa-backed adapters for top-fit accounts.

---

## Architecture

```
Browser ── POST /api/... ──▶ Next.js (Vercel)
                              │ Zod validate · auth cookie · create run
                              ▼
                          Inngest (durable steps, retries)
                              │ /api/inngest (signature verified)
                              ▼
     Exa · Firecrawl · Apollo · NVIDIA Nemotron  ──▶  Neon Postgres
                                                              │
                                    approved leads only ──────▼ HubSpot
```

**Stack:** Next.js App Router, React, TypeScript, Tailwind, shadcn/ui, Zod, Drizzle ORM, Neon, Inngest, pnpm. Model access via `lib/ai` (OpenAI-compatible client; default NVIDIA Nemotron).

### Background jobs

- User actions create `source_runs` rows and emit Inngest events; HTTP returns immediately.
- Steps are time-boxed batches with cursor + lease in Postgres; retries replay failed steps only.
- Writes are upserts on canonical keys (domain, dedupe hashes, evidence hash).
- **No Vercel Cron**; scheduling belongs in Inngest if added later.

### Cost discipline

Search before enrich; Apollo search before enrich; Firecrawl only on high-value pages; Nemotron last for explanation—not for scores.

---

## Security

| Control | Implementation |
| --- | --- |
| App gate | Optional `APP_ACCESS_PASSWORD` — cookie on all routes except `/login` and `/api/inngest` |
| Inngest | `INNGEST_SIGNING_KEY` verifies `/api/inngest` |
| API input | Zod on request bodies; UUID path params where applicable |
| Secrets | `.env` gitignored; use `.env.example` as template only |

**Strongly recommended:** set `APP_ACCESS_PASSWORD` on any public Vercel deployment so anonymous users cannot trigger paid API calls.

---

## Local development

Requirements: **Node 22+**, **pnpm**.

```bash
pnpm install
cp .env.example .env    # fill keys locally — never commit .env
pnpm db:migrate         # applies db/migrations to DATABASE_URL
pnpm dev                # http://localhost:3000
pnpm inngest:dev        # second terminal; set INNGEST_DEV=1 in .env
```

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Backfill event graph → signals (optional):

```bash
pnpm exec tsx scripts/backfill-signal-events.ts
```

---

## Environment variables

Copy `.env.example`. **Never commit real values.**

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Neon Postgres (`postgresql://…`) |
| `EXA_API_KEY` | For discovery/signals | Server-only |
| `FIRECRAWL_API_KEY` | For deep page extract | Server-only |
| `APOLLO_API_KEY` | For org/people | Degrades visibly if plan-limited |
| `NVIDIA_API_KEY` | For explanations | Server-only |
| `MODEL_BASE_URL`, `MODEL_NAME` | No | Default NVIDIA Nemotron |
| `HUBSPOT_ACCESS_TOKEN` | For CRM push | Private app token |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Production jobs | From Inngest dashboard |
| `INNGEST_DEV` | Local only | `1` + `pnpm inngest:dev` |
| `APP_ACCESS_PASSWORD` | **Recommended (prod)** | Shared access gate |
| `NEXT_PUBLIC_APP_URL` | Prod | Canonical site URL (e.g. `https://….vercel.app`) |

Optional tuning: `MAX_COMPANIES_PER_EVENT`, `MAX_PEOPLE_PER_COMPANY`, `MAX_ENRICHMENTS_PER_EVENT`, etc. (see `.env.example`).

---

## Deployment (Vercel + Neon + Inngest)

1. **GitHub:** push this repo (secrets stay out of Git).
2. **Vercel:** import the GitHub repo; framework preset **Next.js**; build `pnpm build`, install `pnpm install`.
3. **Environment:** add all variables above in Vercel **Production** (and Preview if desired). Do **not** set `INNGEST_DEV` in production.
4. **Database:** run migrations against production Neon:
   ```bash
   DATABASE_URL="postgresql://…" pnpm db:migrate
   ```
5. **Inngest:** sync app URL `https://<your-domain>/api/inngest` (Vercel integration or dashboard).
6. **Verify:** `/login` (if gated) → `/system` integration health → one **Source Leads** or **Refresh intelligence** run.

No GitHub Actions are required or included.

**Production (case study):** https://generalmind-gtm-radar.vercel.app — gated with `APP_ACCESS_PASSWORD` (set only in Vercel, not in Git). After deploy, sync Inngest to `https://generalmind-gtm-radar.vercel.app/api/inngest`.

---

## Testing

Unit tests cover scoring, ICP, signal stacking/freshness, JSON extraction, HubSpot adapter mocks, and durable step behaviour (`pnpm test`).

---

## Known limitations

- **Apollo plan:** without People Search/Match, emails may be empty; pipeline uses event pages + Exa profiles and labels uncertainty.
- **Exa signal adapters** run on explicit refresh—not continuous global crawl.
- **Opportunity** is modeled as event leads + account intelligence (no separate CRM object table).
- **M&A signal adapter** not implemented; taxonomy reserved for extension.
- Public web data can be wrong or stale; always inspect evidence before outreach.

---

## Repository

Case study implementation for GeneralMind GTM positioning: coordination across **P2P/O2C** handoffs (email, documents, ERP), not ERP replacement.

**License:** private / case study — see repository owner.
