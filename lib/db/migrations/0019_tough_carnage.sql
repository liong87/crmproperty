ALTER TABLE "users" ADD COLUMN "team_lead_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_team_lead_id_users_id_fk" FOREIGN KEY ("team_lead_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_team_lead_idx" ON "users" USING btree ("team_lead_id");