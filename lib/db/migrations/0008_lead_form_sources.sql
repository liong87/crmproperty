-- Maps an external lead form to a project (roadmap 2.1).
--
-- New campaigns launch weekly. Requiring a code change to route each one is how a CRM
-- stops being used, so the mapping lives in a table an admin can edit.
CREATE TABLE IF NOT EXISTS "lead_form_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(20) NOT NULL,
	"external_form_id" varchar(255) NOT NULL,
	"label" varchar(255) NOT NULL,
	"project_id" uuid,
	"default_interest" varchar(20),
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_form_sources" ADD CONSTRAINT "lead_form_sources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_form_sources_lookup_idx" ON "lead_form_sources" USING btree ("provider","external_form_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_form_sources_project_idx" ON "lead_form_sources" USING btree ("project_id");--> statement-breakpoint
-- One live mapping per form. A second mapping for the same form would make routing
-- depend on row order, which is exactly the kind of bug nobody finds for months.
CREATE UNIQUE INDEX IF NOT EXISTS "lead_form_sources_unique_live" ON "lead_form_sources" ("provider","external_form_id") WHERE deleted_at is null;
