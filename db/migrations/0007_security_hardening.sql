CREATE TABLE IF NOT EXISTS "reviewer_sessions" (
  "id" uuid PRIMARY KEY,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "login_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_attempts_key_idx" ON "login_attempts" ("key_hash", "created_at");
--> statement-breakpoint
ALTER TABLE "source_runs" ADD COLUMN IF NOT EXISTS "dispatch_generation" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hubspot_syncs_one_syncing_uq" ON "hubspot_syncs" ("event_lead_id") WHERE "status" = 'syncing';
--> statement-breakpoint
ALTER TABLE "source_runs" DROP CONSTRAINT IF EXISTS "source_runs_kind_chk";
--> statement-breakpoint
ALTER TABLE "source_runs" ADD CONSTRAINT "source_runs_kind_chk" CHECK (kind IN ('lead_sourcing', 'event_discovery'));
