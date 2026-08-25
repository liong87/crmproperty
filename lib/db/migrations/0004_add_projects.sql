CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"developer" varchar(255),
	"property_type" varchar(30),
	"state" varchar(100) NOT NULL,
	"area" varchar(255) NOT NULL,
	"address" text,
	"gallery_address" text,
	"tenure" varchar(20),
	"title_type" varchar(20),
	"launch_at" timestamp with time zone,
	"expected_vp_at" timestamp with time zone,
	"total_units" integer,
	"bumi_quota_pct" integer,
	"bumi_discount_bp" integer,
	"rebate_package" text,
	"developer_commission_bp" integer,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_unit_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"label" varchar(100) NOT NULL,
	"description" text,
	"built_up_sqft" integer,
	"bedrooms" integer,
	"bathrooms" integer,
	"car_parks" integer,
	"list_price" bigint NOT NULL,
	"nett_price" bigint,
	"total_units" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_unit_types" ADD CONSTRAINT "project_unit_types_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_state_area_idx" ON "projects" USING btree ("state","area");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_live_created_idx" ON "projects" USING btree ("created_at" DESC NULLS FIRST) WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_unit_types_project_idx" ON "project_unit_types" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_unit_types_sort_idx" ON "project_unit_types" USING btree ("project_id","sort_order");
