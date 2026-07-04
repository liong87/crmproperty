CREATE TABLE IF NOT EXISTS "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"entity_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"body" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"follow_up_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assignment_counter" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"last_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"email" varchar(320),
	"interest" varchar(20),
	"budget_min" bigint,
	"budget_max" bigint,
	"preferred_areas" text,
	"id_type" varchar(20),
	"id_number" varchar(100),
	"nationality" varchar(100),
	"occupation" varchar(255),
	"notes" text,
	"assigned_to" uuid,
	"consent_given_at" timestamp with time zone,
	"consent_source" varchar(255),
	"source_lead_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deal_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_terminal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"property_id" uuid,
	"stage_id" uuid NOT NULL,
	"value" bigint,
	"expected_close_date" timestamp with time zone,
	"commission_pct" integer,
	"assigned_to" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"entity_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"filename" varchar(512) NOT NULL,
	"mime_type" varchar(127) NOT NULL,
	"size" bigint NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"email" varchar(320),
	"source" varchar(20) NOT NULL,
	"source_detail" varchar(255),
	"utm_source" varchar(255),
	"utm_medium" varchar(255),
	"utm_campaign" varchar(255),
	"referrer" text,
	"interest" varchar(20),
	"budget_min" bigint,
	"budget_max" bigint,
	"preferred_areas" text,
	"status" varchar(20) DEFAULT 'new' NOT NULL,
	"assigned_to" uuid,
	"consent_given_at" timestamp with time zone,
	"consent_source" varchar(255),
	"converted_to_contact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" varchar(20) NOT NULL,
	"entity_type" varchar(20),
	"entity_id" uuid,
	"to_address" varchar(320) NOT NULL,
	"template_id" uuid,
	"body" text,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"provider_message_id" varchar(255),
	"sent_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(100) NOT NULL,
	"channel" varchar(20) NOT NULL,
	"subject" varchar(512),
	"body" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "message_templates_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"listing_type" varchar(10) NOT NULL,
	"property_type" varchar(30) NOT NULL,
	"tenure" varchar(20),
	"leasehold_expiry" integer,
	"bumi_lot" boolean DEFAULT false NOT NULL,
	"title_type" varchar(20),
	"state" varchar(100) NOT NULL,
	"area" varchar(255) NOT NULL,
	"address" text,
	"built_up_sqft" integer,
	"land_sqft" integer,
	"bedrooms" integer,
	"bathrooms" integer,
	"car_parks" integer,
	"asking_price" bigint NOT NULL,
	"furnishing" varchar(20),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"owner_name" varchar(255),
	"owner_phone" varchar(20),
	"assigned_agent" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_auth_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(320) NOT NULL,
	"phone" varchar(20),
	"role" varchar(20) DEFAULT 'agent' NOT NULL,
	"team_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_external_auth_id_unique" UNIQUE("external_auth_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activities" ADD CONSTRAINT "activities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contacts" ADD CONSTRAINT "contacts_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contacts" ADD CONSTRAINT "contacts_source_lead_id_leads_id_fk" FOREIGN KEY ("source_lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deals" ADD CONSTRAINT "deals_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deals" ADD CONSTRAINT "deals_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deals" ADD CONSTRAINT "deals_stage_id_deal_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."deal_stages"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deals" ADD CONSTRAINT "deals_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_log" ADD CONSTRAINT "message_log_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "properties" ADD CONSTRAINT "properties_assigned_agent_users_id_fk" FOREIGN KEY ("assigned_agent") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_entity_idx" ON "activities" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_follow_up_idx" ON "activities" USING btree ("follow_up_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_created_by_idx" ON "activities" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_phone_idx" ON "contacts" USING btree ("phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_email_idx" ON "contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_assigned_idx" ON "contacts" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_source_lead_idx" ON "contacts" USING btree ("source_lead_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deal_stages_sort_idx" ON "deal_stages" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deals_contact_idx" ON "deals" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deals_property_idx" ON "deals" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deals_stage_idx" ON "deals" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deals_assigned_idx" ON "deals" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_entity_idx" ON "documents" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_uploaded_by_idx" ON "documents" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_phone_idx" ON "leads" USING btree ("phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_email_idx" ON "leads" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_status_idx" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_assigned_idx" ON "leads" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_source_idx" ON "leads" USING btree ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_converted_idx" ON "leads" USING btree ("converted_to_contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_log_entity_idx" ON "message_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_log_status_idx" ON "message_log" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_log_sent_by_idx" ON "message_log" USING btree ("sent_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_templates_key_idx" ON "message_templates" USING btree ("key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "properties_status_idx" ON "properties" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "properties_state_area_idx" ON "properties" USING btree ("state","area");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "properties_listing_type_idx" ON "properties" USING btree ("listing_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "properties_property_type_idx" ON "properties" USING btree ("property_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "properties_assigned_agent_idx" ON "properties" USING btree ("assigned_agent");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_external_auth_idx" ON "users" USING btree ("external_auth_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_team_idx" ON "users" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_role_idx" ON "users" USING btree ("role");