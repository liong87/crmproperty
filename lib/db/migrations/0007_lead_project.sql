-- Leads carry the project they came in for (roadmap 1.6).
--
-- This is what makes a funnel possible. Without it the only thing that can be counted
-- per project is appointments, and the top of the funnel — how many leads a campaign
-- produced for THIS launch — has nowhere to come from. A resale or general enquiry
-- leaves it null, which is why it is nullable rather than defaulted.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "project_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_project_idx" ON "leads" USING btree ("project_id");
