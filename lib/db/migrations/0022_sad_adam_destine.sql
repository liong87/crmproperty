CREATE TABLE IF NOT EXISTS "capture_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(20) NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"provider_user_id" varchar(255) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"access_token" text NOT NULL,
	"token_expires_at" timestamp with time zone,
	"scopes" text,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "capture_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_page_id" varchar(255),
	"leadgen_id" varchar(255) NOT NULL,
	"form_id" varchar(255),
	"raw_payload" text,
	"status" varchar(20) DEFAULT 'received' NOT NULL,
	"error" text,
	"lead_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "capture_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"external_page_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"access_token" text NOT NULL,
	"subscribed" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "lead_form_sources" ADD COLUMN "capture_page_id" uuid;--> statement-breakpoint
ALTER TABLE "lead_form_sources" ADD COLUMN "form_name" varchar(255);--> statement-breakpoint
ALTER TABLE "lead_form_sources" ADD COLUMN "info_fields" jsonb;--> statement-breakpoint
ALTER TABLE "lead_form_sources" ADD COLUMN "run_sequence" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_form_sources" ADD COLUMN "last_lead_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "capture_accounts" ADD CONSTRAINT "capture_accounts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "capture_events" ADD CONSTRAINT "capture_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "capture_pages" ADD CONSTRAINT "capture_pages_account_id_capture_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."capture_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "capture_accounts_owner_idx" ON "capture_accounts" USING btree ("owner_user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "capture_accounts_unique" ON "capture_accounts" USING btree ("provider","provider_user_id","owner_user_id") WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "capture_events_leadgen_unique" ON "capture_events" USING btree ("leadgen_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "capture_events_recent_idx" ON "capture_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "capture_pages_account_idx" ON "capture_pages" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "capture_pages_page_idx" ON "capture_pages" USING btree ("external_page_id");