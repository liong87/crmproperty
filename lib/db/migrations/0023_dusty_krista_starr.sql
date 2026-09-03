/*
 * Learning Hub.
 *
 * NOT a plain CREATE. An earlier, abandoned attempt already left `learning_topics` and
 * `learning_chapters` in production with different columns — uploader_user_id,
 * description, status, document_id — and `CREATE TABLE IF NOT EXISTS` silently skips
 * them, which is how the first run of this migration failed: the tables were left in
 * the old shape and the foreign key had no column to attach to.
 *
 * `learning_topics` holds a row, so it is migrated in place rather than dropped.
 * `learning_chapters` is empty, so it is replaced outright — far simpler than renaming
 * four columns and adding four more to a table with nothing in it.
 *
 * Every step is written to be safe on a database that has never seen the old tables,
 * so a fresh environment gets the same result.
 */

-- ── learning_topics: migrate in place, keeping any rows ──────────────────────
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
	IF EXISTS (SELECT 1 FROM information_schema.columns
	           WHERE table_name = 'learning_topics' AND column_name = 'uploader_user_id') THEN
		ALTER TABLE "learning_topics" RENAME COLUMN "uploader_user_id" TO "owner_user_id";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns
	           WHERE table_name = 'learning_topics' AND column_name = 'description') THEN
		ALTER TABLE "learning_topics" RENAME COLUMN "description" TO "summary";
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "learning_topics" ADD COLUMN IF NOT EXISTS "category" varchar(60);--> statement-breakpoint
ALTER TABLE "learning_topics" ADD COLUMN IF NOT EXISTS "visibility" varchar(20) DEFAULT 'team' NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_topics" ADD COLUMN IF NOT EXISTS "is_published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
/*
 * The old `status` becomes `is_published`. Anything not explicitly published stays a
 * draft: a topic from an abandoned attempt appearing in the team's library would be
 * worse than one that has to be published again deliberately.
 */
DO $$ BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.columns
	           WHERE table_name = 'learning_topics' AND column_name = 'status') THEN
		UPDATE "learning_topics" SET "is_published" = true WHERE "status" = 'published';
		ALTER TABLE "learning_topics" DROP COLUMN "status";
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_topics" ADD CONSTRAINT "learning_topics_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_topics_owner_idx" ON "learning_topics" USING btree ("owner_user_id","is_published");--> statement-breakpoint

-- ── learning_chapters: empty in production, so replace it outright ───────────
DROP TABLE IF EXISTS "learning_chapters" CASCADE;--> statement-breakpoint
CREATE TABLE "learning_chapters" (
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
DO $$ BEGIN
 ALTER TABLE "learning_chapters" ADD CONSTRAINT "learning_chapters_topic_id_learning_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_chapters_topic_idx" ON "learning_chapters" USING btree ("topic_id","position");--> statement-breakpoint

-- ── the two tables that never existed ────────────────────────────────────────
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
DO $$ BEGIN
 ALTER TABLE "learning_attachments" ADD CONSTRAINT "learning_attachments_chapter_id_learning_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."learning_chapters"("id") ON DELETE cascade ON UPDATE no action;
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
CREATE INDEX IF NOT EXISTS "learning_attachments_chapter_idx" ON "learning_attachments" USING btree ("chapter_id");--> statement-breakpoint
/* Makes "Mark as watched" idempotent: a double click cannot push a bar past 100%. */
CREATE UNIQUE INDEX IF NOT EXISTS "learning_progress_unique" ON "learning_progress" USING btree ("user_id","chapter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_progress_user_idx" ON "learning_progress" USING btree ("user_id");
