-- Reconcile the `viewings` table with the schema.
--
-- `viewings` was added to lib/db/schema.ts in "Add viewing scheduler with outcome
-- recording" but no migration was ever generated for it, so it exists in any database
-- that was brought up with `db:push` and is absent from one built by `db:migrate`.
-- Everything here is idempotent, so it is a no-op on a database that already has it
-- and creates it correctly on one that does not.
--
-- The CHECK constraint the schema comment promised ("Exactly one of these is set")
-- was never actually created either. It is added below.

CREATE TABLE IF NOT EXISTS "viewings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"contact_id" uuid,
	"lead_id" uuid,
	"assigned_to" uuid,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" varchar(20) DEFAULT 'scheduled' NOT NULL,
	"outcome" varchar(20),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "viewings" ADD CONSTRAINT "viewings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "viewings" ADD CONSTRAINT "viewings_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "viewings" ADD CONSTRAINT "viewings_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "viewings" ADD CONSTRAINT "viewings_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Exactly one client: a viewing is for a lead or for a contact, never both, never neither.
DO $$ BEGIN
 ALTER TABLE "viewings" ADD CONSTRAINT "viewings_one_client" CHECK (("contact_id" IS NOT NULL) <> ("lead_id" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "viewings_property_idx" ON "viewings" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "viewings_contact_idx" ON "viewings" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "viewings_lead_idx" ON "viewings" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "viewings_assigned_idx" ON "viewings" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "viewings_scheduled_idx" ON "viewings" USING btree ("scheduled_at") WHERE deleted_at is null;
