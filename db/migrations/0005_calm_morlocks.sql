CREATE TABLE "metric_snapshots" (
	"day" date PRIMARY KEY NOT NULL,
	"momentum" integer NOT NULL,
	"quality" integer NOT NULL,
	"volume" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
