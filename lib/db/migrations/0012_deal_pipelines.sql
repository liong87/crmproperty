-- Separate deal-stage pipelines for project sales and resale (roadmap 1.3).
--
-- `deal_stages` was one flat global list, so a new-launch deal and a resale deal moved
-- through the same columns — "Viewing Scheduled" on a booked developer unit is noise.
--
-- Where the boundary sits, and why it is not where the roadmap first said: the
-- appointment board already covers Lead → Appointment → Showed Up → Booked. Repeating
-- those as deal stages would double-count the same events in two places and make the
-- funnel and the pipeline disagree. So a PROJECT deal starts where the appointment
-- board ends — at the booking — and tracks the transaction from there, which is where
-- the developer's money actually moves.

ALTER TABLE "deal_stages" ADD COLUMN IF NOT EXISTS "pipeline" varchar(20) DEFAULT 'resale' NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "deal_type" varchar(20) DEFAULT 'resale' NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "project_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deals" ADD CONSTRAINT "deals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deal_stages_pipeline_idx" ON "deal_stages" USING btree ("pipeline","sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deals_project_idx" ON "deals" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deals_type_idx" ON "deals" USING btree ("deal_type");--> statement-breakpoint

-- Seed the project pipeline, once. Guarded on the pipeline being empty rather than on
-- individual names, so an agency that renames a stage does not get duplicates on a
-- re-run — and an agency that deletes them all can get them back by clearing the table.
INSERT INTO "deal_stages" ("name","sort_order","is_terminal","is_won","pipeline")
SELECT * FROM (VALUES
  ('Booked',           1, false, false, 'project'),
  ('SPA Signed',       2, false, false, 'project'),
  ('Loan Approved',    3, false, false, 'project'),
  ('Completed',        4, true,  true,  'project'),
  ('Cancelled',        5, true,  false, 'project')
) AS v(name, sort_order, is_terminal, is_won, pipeline)
WHERE NOT EXISTS (
  SELECT 1 FROM "deal_stages" WHERE "pipeline" = 'project' AND "deleted_at" IS NULL
);
