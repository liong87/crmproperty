CREATE TABLE IF NOT EXISTS "lead_remarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"user_id" uuid,
	"body" text,
	"status" varchar(30),
	"kind" varchar(10) DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "status" SET DATA TYPE varchar(30);--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "last_follow_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "follow_up_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_remarks" ADD CONSTRAINT "lead_remarks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_remarks" ADD CONSTRAINT "lead_remarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_remarks_lead_idx" ON "lead_remarks" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_remarks_user_idx" ON "lead_remarks" USING btree ("user_id");--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- DATA MIGRATION. Appended by hand to the generated file on purpose: it runs in
-- order, exactly once, and UPDATE statements change no schema, so the snapshot
-- drizzle-kit generated alongside this file stays accurate.
--
-- The four lifecycle statuses become call outcomes. Only the three that carried
-- meaning need mapping; 'new' is unchanged.
--   contacted    -> follow-up      somebody spoke to them and it continues
--   qualified    -> closed         only ever set by lead conversion, i.e. the sale
--   disqualified -> not-searching  the generic dead bucket; nothing recorded WHY a
--                                  lead was disqualified, so a narrower guess would
--                                  be invention rather than migration
-- Reverse mapping is exact, so this is reversible.
UPDATE "leads" SET "status" = 'follow-up'     WHERE "status" = 'contacted';--> statement-breakpoint
UPDATE "leads" SET "status" = 'closed'        WHERE "status" = 'qualified';--> statement-breakpoint
UPDATE "leads" SET "status" = 'not-searching' WHERE "status" = 'disqualified';--> statement-breakpoint

-- Backfill the follow-up counters from the activity timeline, so the follow-up rate
-- does not read 0% for every agent on the morning this deploys. Counts only the
-- activity types that mean somebody contacted the client.
UPDATE "leads" l SET
  "last_follow_up_at" = a.last_at,
  "follow_up_count"   = a.n
FROM (
  SELECT entity_id, max(occurred_at) AS last_at, count(*)::int AS n
  FROM "activities"
  WHERE entity_type = 'leads'
    AND deleted_at IS NULL
    AND type IN ('call','whatsapp','email','appointment','viewing')
  GROUP BY entity_id
) a
WHERE a.entity_id = l.id;
