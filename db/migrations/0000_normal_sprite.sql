CREATE TYPE "public"."ai_status" AS ENUM('pending', 'done', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."association_type" AS ENUM('sponsor', 'exhibitor', 'partner', 'speaker_company', 'public_attendance', 'organizer', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."attendance_type" AS ENUM('official_speaker', 'organizer', 'public_attendance', 'exhibitor_employee', 'sponsor_employee', 'partner_employee', 'company_participating', 'inferred');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('discovered', 'selected', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "public"."evidence_type" AS ENUM('official_speaker', 'official_exhibitor', 'official_sponsor', 'official_attendee', 'company_announcement', 'person_announcement', 'agenda', 'public_web', 'enrichment', 'inference');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('discovered', 'enriching', 'qualified', 'needs_review', 'approved', 'rejected', 'hubspot_synced', 'failed');--> statement-breakpoint
CREATE TYPE "public"."review_action_type" AS ENUM('approve', 'reject', 'edit', 'push_hubspot');--> statement-breakpoint
CREATE TYPE "public"."run_stage" AS ENUM('queued', 'discovering', 'extracting', 'companies', 'people', 'enriching', 'scoring', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('syncing', 'synced', 'failed');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"domain" text,
	"website_url" text,
	"linkedin_url" text,
	"apollo_id" text,
	"industry" text,
	"employee_count" integer,
	"estimated_revenue" bigint,
	"headquarters" text,
	"country" text,
	"description" text,
	"erp_signals" text[] DEFAULT '{}'::text[] NOT NULL,
	"operational_signals" text[] DEFAULT '{}'::text[] NOT NULL,
	"company_fit_score" integer,
	"enriched_at" timestamp with time zone,
	"enrichment_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"association_type" "association_type" DEFAULT 'unknown' NOT NULL,
	"confidence" integer DEFAULT 50 NOT NULL,
	"source_url" text DEFAULT '' NOT NULL,
	"source_title" text,
	"evidence_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"company_id" uuid,
	"attendance_type" "attendance_type" DEFAULT 'inferred' NOT NULL,
	"attendance_confidence" integer DEFAULT 0 NOT NULL,
	"company_fit_score" integer DEFAULT 0 NOT NULL,
	"persona_fit_score" integer DEFAULT 0 NOT NULL,
	"intent_score" integer DEFAULT 0 NOT NULL,
	"total_score" integer DEFAULT 0 NOT NULL,
	"score_breakdown" jsonb,
	"qualification_reason" text,
	"qualification_detail" jsonb,
	"ai_status" "ai_status" DEFAULT 'pending' NOT NULL,
	"ai_error" text,
	"status" "lead_status" DEFAULT 'discovered' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"content" text,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"website_url" text,
	"registration_url" text,
	"start_date" date,
	"end_date" date,
	"city" text,
	"region" text,
	"country" text,
	"venue" text,
	"industry_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"audience_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"agenda_themes" text[] DEFAULT '{}'::text[] NOT NULL,
	"target_personas" text[] DEFAULT '{}'::text[] NOT NULL,
	"relevance_score" integer,
	"relevance_reason" text,
	"source_url" text,
	"dedupe_key" text,
	"status" "event_status" DEFAULT 'discovered' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hubspot_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_lead_id" uuid NOT NULL,
	"hubspot_contact_id" text,
	"hubspot_company_id" text,
	"status" "sync_status" DEFAULT 'syncing' NOT NULL,
	"error" text,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_lead_id" uuid NOT NULL,
	"source_type" "evidence_type" NOT NULL,
	"source_url" text DEFAULT '' NOT NULL,
	"source_title" text,
	"evidence_text" text NOT NULL,
	"evidence_key" text NOT NULL,
	"confidence" integer DEFAULT 50 NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text,
	"last_name" text,
	"full_name" text NOT NULL,
	"name_key" text NOT NULL,
	"title" text,
	"seniority" text,
	"department" text,
	"email" text,
	"email_status" text,
	"linkedin_url" text,
	"location" text,
	"apollo_id" text,
	"company_id" uuid,
	"persona" text,
	"enriched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_lead_id" uuid NOT NULL,
	"action" "review_action_type" NOT NULL,
	"reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"kind" text DEFAULT 'lead_sourcing' NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"stage" "run_stage" DEFAULT 'queued' NOT NULL,
	"events_found" integer DEFAULT 0 NOT NULL,
	"companies_found" integer DEFAULT 0 NOT NULL,
	"people_found" integer DEFAULT 0 NOT NULL,
	"people_enriched" integer DEFAULT 0 NOT NULL,
	"leads_qualified" integer DEFAULT 0 NOT NULL,
	"progress" jsonb DEFAULT '{"steps":[],"cursor":{},"counters":{}}'::jsonb NOT NULL,
	"lease_until" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_companies" ADD CONSTRAINT "event_companies_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_companies" ADD CONSTRAINT "event_companies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_leads" ADD CONSTRAINT "event_leads_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_leads" ADD CONSTRAINT "event_leads_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_leads" ADD CONSTRAINT "event_leads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sources" ADD CONSTRAINT "event_sources_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hubspot_syncs" ADD CONSTRAINT "hubspot_syncs_event_lead_id_event_leads_id_fk" FOREIGN KEY ("event_lead_id") REFERENCES "public"."event_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_evidence" ADD CONSTRAINT "lead_evidence_event_lead_id_event_leads_id_fk" FOREIGN KEY ("event_lead_id") REFERENCES "public"."event_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_actions" ADD CONSTRAINT "review_actions_event_lead_id_event_leads_id_fk" FOREIGN KEY ("event_lead_id") REFERENCES "public"."event_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_runs" ADD CONSTRAINT "source_runs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_domain_uq" ON "companies" USING btree ("domain");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_apollo_uq" ON "companies" USING btree ("apollo_id");--> statement-breakpoint
CREATE INDEX "companies_norm_name_idx" ON "companies" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "event_companies_uq" ON "event_companies" USING btree ("event_id","company_id","association_type","source_url");--> statement-breakpoint
CREATE INDEX "event_companies_event_idx" ON "event_companies" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_leads_event_person_uq" ON "event_leads" USING btree ("event_id","person_id");--> statement-breakpoint
CREATE INDEX "event_leads_status_idx" ON "event_leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "event_leads_score_idx" ON "event_leads" USING btree ("total_score");--> statement-breakpoint
CREATE INDEX "event_leads_event_idx" ON "event_leads" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_sources_event_url_uq" ON "event_sources" USING btree ("event_id","url");--> statement-breakpoint
CREATE INDEX "event_sources_event_idx" ON "event_sources" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_slug_uq" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "events_dedupe_key_uq" ON "events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "events_start_date_idx" ON "events" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hubspot_syncs_lead_idx" ON "hubspot_syncs" USING btree ("event_lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_evidence_key_uq" ON "lead_evidence" USING btree ("event_lead_id","evidence_key");--> statement-breakpoint
CREATE INDEX "lead_evidence_lead_idx" ON "lead_evidence" USING btree ("event_lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "people_apollo_uq" ON "people" USING btree ("apollo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "people_email_uq" ON "people" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "people_linkedin_uq" ON "people" USING btree ("linkedin_url");--> statement-breakpoint
CREATE UNIQUE INDEX "people_company_name_uq" ON "people" USING btree ("company_id","name_key");--> statement-breakpoint
CREATE INDEX "people_company_idx" ON "people" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "review_actions_lead_idx" ON "review_actions" USING btree ("event_lead_id");--> statement-breakpoint
CREATE INDEX "source_runs_event_idx" ON "source_runs" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "source_runs_status_idx" ON "source_runs" USING btree ("status");