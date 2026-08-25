-- Monthly advertising spend per campaign, entered by hand.
--
-- Joined to leads on the campaign NAME (leads.utm_campaign) scoped by channel
-- (leads.utm_source), because that is the only identifier both sides share — Meta's
-- campaign id never reaches us on a lead, and the name is what a person recognises
-- when typing last month's figure in.
CREATE TABLE IF NOT EXISTS "campaign_spend" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign" varchar(255) NOT NULL,
  "utm_source" varchar(255) NOT NULL,
  "month" date NOT NULL,
  "amount" bigint NOT NULL,
  "notes" text,
  "recorded_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign_spend" ADD CONSTRAINT "campaign_spend_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_spend_month_idx" ON "campaign_spend" USING btree ("month");--> statement-breakpoint
-- One figure per campaign per channel per month. A double-submitted form would
-- otherwise halve every cost-per-lead figure on the report and look entirely normal.
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_spend_unique_idx" ON "campaign_spend" USING btree ("campaign","utm_source","month") WHERE deleted_at is null;
