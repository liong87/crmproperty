CREATE TABLE IF NOT EXISTS "connected_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(20) NOT NULL,
	"external_page_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"access_token" text NOT NULL,
	"scopes" text,
	"expires_at" timestamp with time zone,
	"connected_by" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "connected_pages" ADD CONSTRAINT "connected_pages_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "connected_pages_unique" ON "connected_pages" USING btree ("provider","external_page_id") WHERE deleted_at is null;