-- Deal document checklists with deadlines (roadmap 3.2).
--
-- The paperwork is what actually stalls a transaction, and an expiring loan approval is
-- the classic preventable deal-killer: the letter has a date on it, nobody is watching
-- it, and the booking collapses. This gives every deal a checklist with dates that a
-- query can surface before they pass.

CREATE TABLE IF NOT EXISTS "document_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline" varchar(20) NOT NULL,
	"label" varchar(255) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"due_after_days" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deal_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"requirement_id" uuid,
	"label" varchar(255) NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"document_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_requirement_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."document_requirements"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_requirements_pipeline_idx" ON "document_requirements" USING btree ("pipeline","sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deal_documents_deal_idx" ON "deal_documents" USING btree ("deal_id","sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deal_documents_due_idx" ON "deal_documents" USING btree ("due_at") WHERE completed_at is null and deleted_at is null;--> statement-breakpoint

-- Default checklists. Guarded on the pipeline being empty rather than on individual
-- labels, so an agency that renames or deletes items does not get duplicates on a
-- re-run, and can restore the defaults by clearing the pipeline's rows.
INSERT INTO "document_requirements" ("pipeline","label","sort_order","required","due_after_days")
SELECT * FROM (VALUES
  ('project','Booking form',                    1, true,  3),
  ('project','Booking fee receipt',             2, true,  3),
  ('project','IC or passport copy',             3, true,  7),
  ('project','Income documents',                4, true,  14),
  ('project','Loan application submitted',      5, true,  21),
  -- The one that kills deals. The letter carries its own expiry; due_at is edited
  -- to that date on the deal itself.
  ('project','Loan approval letter',            6, true,  45),
  ('project','SPA signed',                      7, true,  60),
  ('project','Stamping and legal',              8, false, 90)
) AS v(pipeline,label,sort_order,required,due_after_days)
WHERE NOT EXISTS (SELECT 1 FROM "document_requirements" WHERE "pipeline"='project' AND "deleted_at" IS NULL);
--> statement-breakpoint
INSERT INTO "document_requirements" ("pipeline","label","sort_order","required","due_after_days")
SELECT * FROM (VALUES
  ('resale','Offer to purchase / booking form', 1, true,  3),
  ('resale','IC or passport copy',              2, true,  7),
  ('resale','Loan approval letter',             3, true,  30),
  ('resale','Sale and purchase agreement',      4, true,  45),
  ('resale','Consent to transfer (leasehold)',  5, false, 60),
  ('resale','Stamping and legal',               6, false, 90)
) AS v(pipeline,label,sort_order,required,due_after_days)
WHERE NOT EXISTS (SELECT 1 FROM "document_requirements" WHERE "pipeline"='resale' AND "deleted_at" IS NULL);
