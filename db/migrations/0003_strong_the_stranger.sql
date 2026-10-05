ALTER TABLE "event_leads" ADD COLUMN "priority_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_leads" ADD COLUMN "signal_frequency" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_leads" ADD COLUMN "opportunity_hypothesis" jsonb;--> statement-breakpoint
ALTER TABLE "event_leads" ADD COLUMN "quality_flags" jsonb;--> statement-breakpoint
ALTER TABLE "event_leads" ADD COLUMN "last_verified_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "event_leads_priority_idx" ON "event_leads" USING btree ("priority_score");