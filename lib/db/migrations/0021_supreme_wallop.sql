ALTER TABLE "leads" ADD COLUMN "info" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "recycle_count" integer DEFAULT 0 NOT NULL;