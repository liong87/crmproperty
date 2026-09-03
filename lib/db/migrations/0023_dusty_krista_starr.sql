CREATE TABLE IF NOT EXISTS "learning_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter_id" uuid NOT NULL,
	"filename" varchar(255) NOT NULL,
	"storage_key" text NOT NULL,
	"size_bytes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"title" varchar(255) NOT NULL,
	"duration_seconds" integer,
	"video_kind" varchar(10) NOT NULL,
	"video_url_or_key" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chapter_id" uuid NOT NULL,
	"watched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"summary" text,
	"category" varchar(60),
	"visibility" varchar(20) DEFAULT 'team' NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_attachments" ADD CONSTRAINT "learning_attachments_chapter_id_learning_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."learning_chapters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_chapters" ADD CONSTRAINT "learning_chapters_topic_id_learning_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_progress" ADD CONSTRAINT "learning_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_progress" ADD CONSTRAINT "learning_progress_chapter_id_learning_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."learning_chapters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_topics" ADD CONSTRAINT "learning_topics_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_attachments_chapter_idx" ON "learning_attachments" USING btree ("chapter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_chapters_topic_idx" ON "learning_chapters" USING btree ("topic_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "learning_progress_unique" ON "learning_progress" USING btree ("user_id","chapter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_progress_user_idx" ON "learning_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_topics_owner_idx" ON "learning_topics" USING btree ("owner_user_id","is_published");