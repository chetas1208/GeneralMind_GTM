CREATE TYPE "public"."signal_direction" AS ENUM('positive', 'negative', 'neutral');--> statement-breakpoint
CREATE TYPE "public"."signal_status" AS ENUM('candidate', 'verified', 'rejected', 'expired');--> statement-breakpoint
CREATE TABLE "signal_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"workflow" text NOT NULL,
	"signal_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"urgency" integer DEFAULT 0 NOT NULL,
	"strength" integer DEFAULT 0 NOT NULL,
	"direction" "signal_direction" DEFAULT 'positive' NOT NULL,
	"first_observed_at" timestamp with time zone NOT NULL,
	"last_observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"person_id" uuid,
	"event_id" uuid,
	"event_lead_id" uuid,
	"type" text NOT NULL,
	"direction" "signal_direction" DEFAULT 'positive' NOT NULL,
	"status" "signal_status" DEFAULT 'candidate' NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"occurred_at" timestamp with time zone,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"source_url" text DEFAULT '' NOT NULL,
	"source_title" text,
	"evidence_text" text,
	"confidence" integer DEFAULT 50 NOT NULL,
	"relevance" integer DEFAULT 50 NOT NULL,
	"urgency" integer DEFAULT 50 NOT NULL,
	"workflow_hints" text[] DEFAULT '{}'::text[] NOT NULL,
	"dedupe_key" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "account_priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "account_intelligence" jsonb;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "intelligence_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "signal_clusters" ADD CONSTRAINT "signal_clusters_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_event_lead_id_event_leads_id_fk" FOREIGN KEY ("event_lead_id") REFERENCES "public"."event_leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "signal_clusters_company_workflow_uq" ON "signal_clusters" USING btree ("company_id","workflow");--> statement-breakpoint
CREATE INDEX "signal_clusters_company_idx" ON "signal_clusters" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "signals_company_dedupe_uq" ON "signals" USING btree ("company_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "signals_company_idx" ON "signals" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "signals_type_idx" ON "signals" USING btree ("type");--> statement-breakpoint
CREATE INDEX "signals_status_idx" ON "signals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "signals_discovered_idx" ON "signals" USING btree ("discovered_at");--> statement-breakpoint
CREATE INDEX "companies_account_priority_idx" ON "companies" USING btree ("account_priority");