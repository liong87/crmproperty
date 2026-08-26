-- Project lead pools, assignment history and the pass-on SLA (roadmap 2.2).

-- Who works a project's leads, and in what order.
CREATE TABLE IF NOT EXISTS "project_pool_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
-- Every change of hands, append-only. The lead row says who holds it now; this says
-- who held it before, who passed it, and why.
CREATE TABLE IF NOT EXISTS "lead_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"from_user_id" uuid,
	"to_user_id" uuid,
	"reason" varchar(20) NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_pool_members" ADD CONSTRAINT "project_pool_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_pool_members" ADD CONSTRAINT "project_pool_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_pool_members_project_idx" ON "project_pool_members" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_pool_members_user_idx" ON "project_pool_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_pool_members_order_idx" ON "project_pool_members" USING btree ("project_id","sort_order");--> statement-breakpoint
-- One live membership per person per project: two rows would make the rotation
-- depend on row order and hand somebody double the leads.
CREATE UNIQUE INDEX IF NOT EXISTS "project_pool_members_unique_live" ON "project_pool_members" ("project_id","user_id") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_assignments_lead_idx" ON "lead_assignments" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_assignments_to_idx" ON "lead_assignments" USING btree ("to_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_assignments_from_idx" ON "lead_assignments" USING btree ("from_user_id");--> statement-breakpoint

-- The SLA window, per project. Null means never pass on.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "pass_on_after_days" integer;--> statement-breakpoint

-- When the CURRENT owner got it. Reset on every reassignment, so the sweep measures
-- how long THIS person has sat on it rather than how old the lead is.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "assigned_at" timestamp with time zone;--> statement-breakpoint
-- Backfill: existing leads are treated as assigned when they were created. Without
-- this every historical lead reads as infinitely overdue and the first sweep would
-- reassign the entire back catalogue in one go.
UPDATE "leads" SET "assigned_at" = "created_at" WHERE "assigned_at" IS NULL AND "assigned_to" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_pass_on_idx" ON "leads" USING btree ("assigned_at") WHERE deleted_at is null and converted_to_contact_id is null;
