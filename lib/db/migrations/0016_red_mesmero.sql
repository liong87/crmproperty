-- project_resources — a project's sales kit.
--
-- HAND-TRIMMED. What drizzle-kit generated was 492 lines recreating 16 tables that
-- already exist, and applying it failed (correctly) on:
--     ALTER TABLE "deal_stages" ADD COLUMN "pipeline" varchar(20) ...
-- because that column has existed since 0012. The original is kept at
-- _to_delete/0016_red_mesmero.FULL-SCHEMA.sql.bak if you want to compare.
--
-- WHY IT CAME OUT WRONG: meta/_journal.json lists 0000-0015, but meta/ only holds
-- snapshots for 0000-0003. Migrations 0004-0015 were hand-written and journalled
-- WITHOUT generating snapshots, so drizzle-kit's last known state of this schema was
-- 10 August. It diffed today's schema against that, and dutifully emitted everything
-- added since — projects, appointments, lead pools, deal pipelines, deal documents,
-- commission, notifications — as if the database were still on 0003.
--
-- Only project_resources is genuinely new. The failed run proved it: every other
-- CREATE TABLE in the generated file reported "already exists, skipping".
--
-- THIS HEALS THE PROBLEM GOING FORWARD. meta/0016_snapshot.json, generated in the same
-- run, IS a complete and correct snapshot of the current schema. Once this migration is
-- recorded, the next `pnpm db:generate` diffs against reality and emits normal
-- incremental migrations again. Do not hand-write a migration without also generating
-- its snapshot, or this recurs.

CREATE TABLE IF NOT EXISTS "project_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"category" varchar(30) NOT NULL,
	"label" varchar(255) NOT NULL,
	"document_id" uuid,
	"url" text,
	"value" text,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_resources" ADD CONSTRAINT "project_resources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_resources" ADD CONSTRAINT "project_resources_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_resources" ADD CONSTRAINT "project_resources_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_resources_project_idx" ON "project_resources" USING btree ("project_id","category","sort_order");
