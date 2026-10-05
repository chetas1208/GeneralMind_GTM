ALTER TYPE "public"."run_stage" ADD VALUE 'qualifying';--> statement-breakpoint
ALTER TYPE "public"."run_stage" ADD VALUE 'finding_people';--> statement-breakpoint
ALTER TYPE "public"."run_stage" ADD VALUE 'verifying';--> statement-breakpoint
ALTER TYPE "public"."run_stage" ADD VALUE 'synthesizing';--> statement-breakpoint
ALTER TYPE "public"."run_stage" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."run_status" ADD VALUE 'cancel_requested';--> statement-breakpoint
ALTER TYPE "public"."run_status" ADD VALUE 'cancelled';