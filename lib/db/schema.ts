import { relations, sql } from "drizzle-orm";
import {
  bigint,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export const eventStatus = pgEnum("event_status", ["discovered", "selected", "rejected", "archived"]);

export const associationType = pgEnum("association_type", [
  "sponsor",
  "exhibitor",
  "partner",
  "speaker_company",
  "public_attendance",
  "organizer",
  "unknown",
]);

/** How the person is linked to the event, strongest to weakest. */
export const attendanceType = pgEnum("attendance_type", [
  "official_speaker",
  "organizer",
  "public_attendance",
  "exhibitor_employee",
  "sponsor_employee",
  "partner_employee",
  "company_participating",
  "inferred",
]);

export const leadStatus = pgEnum("lead_status", [
  "discovered",
  "enriching",
  "qualified",
  "needs_review",
  "approved",
  "rejected",
  "hubspot_synced",
  "failed",
]);

export const evidenceType = pgEnum("evidence_type", [
  "official_speaker",
  "official_exhibitor",
  "official_sponsor",
  "official_attendee",
  "company_announcement",
  "person_announcement",
  "agenda",
  "public_web",
  "enrichment",
  "inference",
]);

export const reviewActionType = pgEnum("review_action_type", ["approve", "reject", "edit", "push_hubspot"]);

export const syncStatus = pgEnum("sync_status", ["syncing", "synced", "failed"]);

export const runStatus = pgEnum("run_status", ["queued", "running", "complete", "failed", "cancel_requested", "cancelled"]);

export const runStage = pgEnum("run_stage", [
  "queued",
  "discovering",
  "extracting",
  "companies", // legacy name of "qualifying" (kept so existing rows stay valid)
  "people", // legacy name of "finding_people"
  "enriching",
  "scoring",
  "complete",
  "failed",
  "qualifying",
  "finding_people",
  "verifying",
  "synthesizing",
  "cancelled",
]);

export const aiStatus = pgEnum("ai_status", ["pending", "done", "failed", "skipped"]);

export const signalDirection = pgEnum("signal_direction", ["positive", "negative", "neutral"]);
export const signalStatus = pgEnum("signal_status", ["candidate", "verified", "rejected", "expired"]);

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

export type EventAssessmentJson = {
  decisionMakerDensity: "low" | "medium" | "high";
  scale: "low" | "medium" | "high";
  breakdown: { total: number; max: number; factors: { key: string; label: string; points: number; max: number; note: string }[] };
  assessedAt: string;
  model?: string;
};

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    websiteUrl: text("website_url"),
    registrationUrl: text("registration_url"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    city: text("city"),
    region: text("region"),
    country: text("country"),
    venue: text("venue"),
    industryTags: text("industry_tags").array().notNull().default(sql`'{}'::text[]`),
    audienceTags: text("audience_tags").array().notNull().default(sql`'{}'::text[]`),
    agendaThemes: text("agenda_themes").array().notNull().default(sql`'{}'::text[]`),
    targetPersonas: text("target_personas").array().notNull().default(sql`'{}'::text[]`),
    relevanceScore: integer("relevance_score"),
    relevanceReason: text("relevance_reason"),
    /** Categorical model ratings + the deterministic score breakdown they produced. */
    assessment: jsonb("assessment").$type<EventAssessmentJson>(),
    sourceUrl: text("source_url"),
    /** Normalised website host+path used to deduplicate discovery results. */
    dedupeKey: text("dedupe_key"),
    status: eventStatus("status").notNull().default("discovered"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("events_slug_uq").on(t.slug),
    uniqueIndex("events_dedupe_key_uq").on(t.dedupeKey),
    index("events_start_date_idx").on(t.startDate),
    index("events_status_idx").on(t.status),
  ],
);

/** Preserved source material for an event (search hits, scraped pages). */
export const eventSources = pgTable(
  "event_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // discovery | speakers | sponsors | exhibitors | agenda | overview | other
    url: text("url").notNull(),
    title: text("title"),
    /** Stored text is plain text/markdown only; never rendered as HTML. */
    content: text("content"),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("event_sources_event_url_uq").on(t.eventId, t.url), index("event_sources_event_idx").on(t.eventId)],
);

/* -------------------------------------------------------------------------- */
/* Companies & people                                                         */
/* -------------------------------------------------------------------------- */

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    domain: text("domain"),
    websiteUrl: text("website_url"),
    linkedinUrl: text("linkedin_url"),
    apolloId: text("apollo_id"),
    industry: text("industry"),
    employeeCount: integer("employee_count"),
    estimatedRevenue: bigint("estimated_revenue", { mode: "number" }),
    headquarters: text("headquarters"),
    country: text("country"),
    description: text("description"),
    erpSignals: text("erp_signals").array().notNull().default(sql`'{}'::text[]`),
    operationalSignals: text("operational_signals").array().notNull().default(sql`'{}'::text[]`),
    companyFitScore: integer("company_fit_score"),
    /** Aggregated actionable priority from fit + active signals (0–100). */
    accountPriority: integer("account_priority").notNull().default(0),
    accountIntelligence: jsonb("account_intelligence").$type<AccountIntelligenceJson>(),
    intelligenceUpdatedAt: timestamp("intelligence_updated_at", { withTimezone: true }),
    enrichedAt: timestamp("enriched_at", { withTimezone: true }),
    enrichmentError: text("enrichment_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("companies_domain_uq").on(t.domain),
    uniqueIndex("companies_apollo_uq").on(t.apolloId),
    index("companies_norm_name_idx").on(t.normalizedName),
    index("companies_account_priority_idx").on(t.accountPriority),
  ],
);

export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    fullName: text("full_name").notNull(),
    /** lower(name) with punctuation removed, for dedupe within a company. */
    nameKey: text("name_key").notNull(),
    title: text("title"),
    seniority: text("seniority"),
    department: text("department"),
    email: text("email"),
    emailStatus: text("email_status"),
    linkedinUrl: text("linkedin_url"),
    location: text("location"),
    apolloId: text("apollo_id"),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    persona: text("persona"),
    enrichedAt: timestamp("enriched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("people_apollo_uq").on(t.apolloId),
    uniqueIndex("people_email_uq").on(t.email),
    uniqueIndex("people_linkedin_uq").on(t.linkedinUrl),
    uniqueIndex("people_company_name_uq").on(t.companyId, t.nameKey),
    index("people_company_idx").on(t.companyId),
  ],
);

export type AccountIntelligenceJson = {
  whyNow?: string;
  whyGeneralMind?: string;
  discoveryAngle?: string;
  activeSignalCount?: number;
  alignedClusterCount?: number;
  stackingBonus?: number;
  priorityBreakdown?: { key: string; label: string; points: number; max: number }[];
  topWorkflows?: { workflow: string; fit: number; evidence: string }[];
  /** Last time external (web) signal adapters ran for this account; drives the refresh cooldown. */
  externalRefreshAt?: string;
  updatedAt?: string;
};

/* -------------------------------------------------------------------------- */
/* Event graph                                                                */
/* -------------------------------------------------------------------------- */

export const eventCompanies = pgTable(
  "event_companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    associationType: associationType("association_type").notNull().default("unknown"),
    confidence: integer("confidence").notNull().default(50),
    sourceUrl: text("source_url").notNull().default(""),
    sourceTitle: text("source_title"),
    evidenceText: text("evidence_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("event_companies_uq").on(t.eventId, t.companyId, t.associationType, t.sourceUrl),
    index("event_companies_event_idx").on(t.eventId),
  ],
);

export type ScoreBreakdownJson = {
  company: { total: number; max: number; factors: { key: string; label: string; points: number; max: number; note: string }[] };
  persona: { total: number; max: number; factors: { key: string; label: string; points: number; max: number; note: string }[] };
  intent: { total: number; max: number; factors: { key: string; label: string; points: number; max: number; note: string }[] };
  total: number;
  version: string;
};

export type QualificationDetailJson = {
  whyCompanyFits: string;
  whyPersonMatters: string;
  eventLink: string;
  uncertainty: string;
  nextStep: string;
};

export type OpportunityHypothesisJson = {
  workflows: string[];
  confidence: number;
  evidence: string[];
  rationale: string;
  classification: "evidence_backed" | "strong_inference" | "speculative";
  promptVersion?: string;
  model?: string;
  generatedAt?: string;
};

export type LeadQualityFlagsJson = {
  titleMismatch?: boolean;
  weakEvidence?: boolean;
  irrelevantPersona?: boolean;
  staleEvent?: boolean;
};

export const eventLeads = pgTable(
  "event_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),

    attendanceType: attendanceType("attendance_type").notNull().default("inferred"),
    /** 0-100. Derived deterministically from evidence, never by the model. */
    attendanceConfidence: integer("attendance_confidence").notNull().default(0),

    companyFitScore: integer("company_fit_score").notNull().default(0),
    personaFitScore: integer("persona_fit_score").notNull().default(0),
    intentScore: integer("intent_score").notNull().default(0),
    totalScore: integer("total_score").notNull().default(0),
    /** Actionable sort key — fit + timing + confidence + contactability. */
    priorityScore: integer("priority_score").notNull().default(0),
    /** Times this person appeared on relevant events (cross-event signal). */
    signalFrequency: integer("signal_frequency").notNull().default(1),
    opportunityHypothesis: jsonb("opportunity_hypothesis").$type<OpportunityHypothesisJson>(),
    qualityFlags: jsonb("quality_flags").$type<LeadQualityFlagsJson>(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    scoreBreakdown: jsonb("score_breakdown").$type<ScoreBreakdownJson>(),

    qualificationReason: text("qualification_reason"),
    qualificationDetail: jsonb("qualification_detail").$type<QualificationDetailJson>(),
    aiStatus: aiStatus("ai_status").notNull().default("pending"),
    aiError: text("ai_error"),

    status: leadStatus("status").notNull().default("discovered"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("event_leads_event_person_uq").on(t.eventId, t.personId),
    index("event_leads_status_idx").on(t.status),
    index("event_leads_score_idx").on(t.totalScore),
    index("event_leads_priority_idx").on(t.priorityScore),
    index("event_leads_event_idx").on(t.eventId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Market signals (universal primitive)                                       */
/* -------------------------------------------------------------------------- */

export const signals = pgTable(
  "signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    personId: uuid("person_id").references(() => people.id, { onDelete: "set null" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    eventLeadId: uuid("event_lead_id").references(() => eventLeads.id, { onDelete: "set null" }),

    type: text("type").notNull(),
    direction: signalDirection("direction").notNull().default("positive"),
    status: signalStatus("status").notNull().default("candidate"),

    title: text("title").notNull(),
    summary: text("summary").notNull(),

    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    sourceUrl: text("source_url").notNull().default(""),
    sourceTitle: text("source_title"),
    evidenceText: text("evidence_text"),

    confidence: integer("confidence").notNull().default(50),
    relevance: integer("relevance").notNull().default(50),
    urgency: integer("urgency").notNull().default(50),

    workflowHints: text("workflow_hints").array().notNull().default(sql`'{}'::text[]`),
    dedupeKey: text("dedupe_key").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("signals_company_dedupe_uq").on(t.companyId, t.dedupeKey),
    index("signals_company_idx").on(t.companyId),
    index("signals_type_idx").on(t.type),
    index("signals_status_idx").on(t.status),
    index("signals_discovered_idx").on(t.discoveredAt),
  ],
);

export const signalClusters = pgTable(
  "signal_clusters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    workflow: text("workflow").notNull(),
    signalIds: uuid("signal_ids").array().notNull().default(sql`'{}'::uuid[]`),
    confidence: integer("confidence").notNull().default(0),
    urgency: integer("urgency").notNull().default(0),
    strength: integer("strength").notNull().default(0),
    direction: signalDirection("direction").notNull().default("positive"),
    firstObservedAt: timestamp("first_observed_at", { withTimezone: true }).notNull(),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("signal_clusters_company_workflow_uq").on(t.companyId, t.workflow), index("signal_clusters_company_idx").on(t.companyId)],
);

export const leadEvidence = pgTable(
  "lead_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventLeadId: uuid("event_lead_id")
      .notNull()
      .references(() => eventLeads.id, { onDelete: "cascade" }),
    sourceType: evidenceType("source_type").notNull(),
    sourceUrl: text("source_url").notNull().default(""),
    sourceTitle: text("source_title"),
    evidenceText: text("evidence_text").notNull(),
    /** Hash of (type|url|text) to make re-runs idempotent. */
    evidenceKey: text("evidence_key").notNull(),
    confidence: integer("confidence").notNull().default(50),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("lead_evidence_key_uq").on(t.eventLeadId, t.evidenceKey),
    index("lead_evidence_lead_idx").on(t.eventLeadId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Review, CRM, pipeline runs                                                 */
/* -------------------------------------------------------------------------- */

export const reviewActions = pgTable(
  "review_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventLeadId: uuid("event_lead_id")
      .notNull()
      .references(() => eventLeads.id, { onDelete: "cascade" }),
    action: reviewActionType("action").notNull(),
    reason: text("reason"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("review_actions_lead_idx").on(t.eventLeadId)],
);

export const hubspotSyncs = pgTable(
  "hubspot_syncs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventLeadId: uuid("event_lead_id")
      .notNull()
      .references(() => eventLeads.id, { onDelete: "cascade" }),
    hubspotContactId: text("hubspot_contact_id"),
    hubspotCompanyId: text("hubspot_company_id"),
    status: syncStatus("status").notNull().default("syncing"),
    error: text("error"),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("hubspot_syncs_lead_idx").on(t.eventLeadId)],
);

export type SourceRunProgress = {
  /** Human-readable step log shown in the UI. */
  steps: { at: string; stage: string; message: string; level: "info" | "warn" | "error" }[];
  /** Resumable cursor state; interpretation owned by the pipeline. */
  cursor: {
    // event discovery
    queriesDone?: number;
    hits?: { url: string; title: string | null; text: string }[];
    hitsDone?: number;
    assessQueue?: string[];
    assessDone?: number;
    // lead sourcing
    stagesDone?: string[];
    sourcesSearched?: boolean;
    pageUrls?: string[];
    pagesDone?: number;
    companyQueue?: string[];
    companiesDone?: number;
    qualifiedCompanyIds?: string[];
    peopleQueue?: string[];
    peopleDone?: number;
    announcementQueue?: string[];
    announcementsDone?: number;
    enrichQueue?: string[];
    enrichDone?: number;
    scoreQueue?: string[];
    scoreDone?: number;
    explainQueue?: string[];
    explainDone?: number;
  };
  counters: {
    companiesQualified?: number;
    companiesEnriched?: number;
    candidatePeople?: number;
    enrichTarget?: number;
    apolloCalls?: number;
    aiFailures?: number;
    personaAiCalls?: number;
    apolloPeopleUnavailable?: boolean;
    apolloPeopleSearch?: number;
  };
};

export const sourceRuns = pgTable(
  "source_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null for event-discovery runs. */
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("lead_sourcing"), // lead_sourcing | event_discovery
    status: runStatus("status").notNull().default("queued"),
    stage: runStage("stage").notNull().default("queued"),

    eventsFound: integer("events_found").notNull().default(0),
    companiesFound: integer("companies_found").notNull().default(0),
    peopleFound: integer("people_found").notNull().default(0),
    peopleEnriched: integer("people_enriched").notNull().default(0),
    leadsQualified: integer("leads_qualified").notNull().default(0),

    progress: jsonb("progress")
      .$type<SourceRunProgress>()
      .notNull()
      .default(sql`'{"steps":[],"cursor":{},"counters":{}}'::jsonb`),
    /** Lease: another tick may not process this run until it expires. */
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("source_runs_event_idx").on(t.eventId), index("source_runs_status_idx").on(t.status)],
);

/** One row per UTC day. Written when scores change and when Radar loads, never by cron. */
export const metricSnapshots = pgTable("metric_snapshots", {
  day: date("day").primaryKey(),
  momentum: integer("momentum").notNull(),
  quality: integer("quality").notNull(),
  volume: integer("volume").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/* Relations                                                                  */
/* -------------------------------------------------------------------------- */

export const eventsRelations = relations(events, ({ many }) => ({
  sources: many(eventSources),
  eventCompanies: many(eventCompanies),
  leads: many(eventLeads),
  runs: many(sourceRuns),
}));

export const eventSourcesRelations = relations(eventSources, ({ one }) => ({
  event: one(events, { fields: [eventSources.eventId], references: [events.id] }),
}));

export const companiesRelations = relations(companies, ({ many }) => ({
  people: many(people),
  eventCompanies: many(eventCompanies),
  signals: many(signals),
  signalClusters: many(signalClusters),
}));

export const signalsRelations = relations(signals, ({ one }) => ({
  company: one(companies, { fields: [signals.companyId], references: [companies.id] }),
  person: one(people, { fields: [signals.personId], references: [people.id] }),
  event: one(events, { fields: [signals.eventId], references: [events.id] }),
}));

export const signalClustersRelations = relations(signalClusters, ({ one }) => ({
  company: one(companies, { fields: [signalClusters.companyId], references: [companies.id] }),
}));

export const peopleRelations = relations(people, ({ one }) => ({
  company: one(companies, { fields: [people.companyId], references: [companies.id] }),
}));

export const eventCompaniesRelations = relations(eventCompanies, ({ one }) => ({
  event: one(events, { fields: [eventCompanies.eventId], references: [events.id] }),
  company: one(companies, { fields: [eventCompanies.companyId], references: [companies.id] }),
}));

export const eventLeadsRelations = relations(eventLeads, ({ one, many }) => ({
  event: one(events, { fields: [eventLeads.eventId], references: [events.id] }),
  person: one(people, { fields: [eventLeads.personId], references: [people.id] }),
  company: one(companies, { fields: [eventLeads.companyId], references: [companies.id] }),
  evidence: many(leadEvidence),
  reviews: many(reviewActions),
  syncs: many(hubspotSyncs),
}));

export const leadEvidenceRelations = relations(leadEvidence, ({ one }) => ({
  lead: one(eventLeads, { fields: [leadEvidence.eventLeadId], references: [eventLeads.id] }),
}));

export const reviewActionsRelations = relations(reviewActions, ({ one }) => ({
  lead: one(eventLeads, { fields: [reviewActions.eventLeadId], references: [eventLeads.id] }),
}));

export const hubspotSyncsRelations = relations(hubspotSyncs, ({ one }) => ({
  lead: one(eventLeads, { fields: [hubspotSyncs.eventLeadId], references: [eventLeads.id] }),
}));

export const sourceRunsRelations = relations(sourceRuns, ({ one }) => ({
  event: one(events, { fields: [sourceRuns.eventId], references: [events.id] }),
}));