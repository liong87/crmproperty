-- Viewings become appointments (project sales core, roadmap 1.2).
--
-- A resale viewing and a new-launch gallery appointment are the same record with a
-- different subject: one is a buyer at a unit, the other a buyer at a sales gallery.
-- Rather than a second table, the existing one is widened to point at EITHER a
-- property or a project, and renamed to the word the business actually uses.
--
-- Also adds the closer. `assigned_to` is the SETTER — the agent who owns the client
-- and booked the appointment — and stays the column ownership filters key on.
-- `closer_id` is who runs the presentation, which under a setter/closer split is
-- often somebody else, and must be recorded at the time because commission splits on it.

ALTER TABLE "viewings" RENAME TO "appointments";--> statement-breakpoint

ALTER INDEX IF EXISTS "viewings_property_idx" RENAME TO "appointments_property_idx";--> statement-breakpoint
ALTER INDEX IF EXISTS "viewings_contact_idx" RENAME TO "appointments_contact_idx";--> statement-breakpoint
ALTER INDEX IF EXISTS "viewings_lead_idx" RENAME TO "appointments_lead_idx";--> statement-breakpoint
ALTER INDEX IF EXISTS "viewings_assigned_idx" RENAME TO "appointments_assigned_idx";--> statement-breakpoint
ALTER INDEX IF EXISTS "viewings_scheduled_idx" RENAME TO "appointments_scheduled_idx";--> statement-breakpoint

-- A gallery appointment has no property, so the column can no longer be mandatory.
ALTER TABLE "appointments" ALTER COLUMN "property_id" DROP NOT NULL;--> statement-breakpoint

ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "project_id" uuid;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "closer_id" uuid;--> statement-breakpoint
-- Short free-text shown in list and board views: "Rang out, will retry."
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "remark" varchar(500);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "appointments" ADD CONSTRAINT "appointments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointments" ADD CONSTRAINT "appointments_closer_id_users_id_fk" FOREIGN KEY ("closer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Status and outcome move to the project sales vocabulary. Existing rows are mapped,
-- not dropped: a completed viewing showed up, and an offer made is a booking.
--   status   scheduled | showed-up | no-show | cancelled   (was: ... | completed | ...)
--   outcome  booked | interested | not-interested | undecided   (was: ... offer-made ...)
UPDATE "appointments" SET "status" = 'showed-up' WHERE "status" = 'completed';--> statement-breakpoint
UPDATE "appointments" SET "outcome" = 'booked' WHERE "outcome" = 'offer-made';--> statement-breakpoint

-- Exactly one subject: a property (resale) or a project (new launch), never both.
-- Existing rows all carry a property, so this is satisfied on arrival.
DO $$ BEGIN
 ALTER TABLE "appointments" ADD CONSTRAINT "appointments_one_subject" CHECK (("property_id" IS NOT NULL) <> ("project_id" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointments" RENAME CONSTRAINT "viewings_one_client" TO "appointments_one_client";
EXCEPTION WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "appointments_project_idx" ON "appointments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_closer_idx" ON "appointments" USING btree ("closer_id");--> statement-breakpoint
-- The appointment board reads "everything not yet resolved, soonest first".
CREATE INDEX IF NOT EXISTS "appointments_board_idx" ON "appointments" USING btree ("status","scheduled_at") WHERE deleted_at is null;
