CREATE TABLE IF NOT EXISTS "learning_chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"document_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "learning_topics" DROP CONSTRAINT "learning_topics_document_id_documents_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_chapters" ADD CONSTRAINT "learning_chapters_topic_id_learning_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_chapters" ADD CONSTRAINT "learning_chapters_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_chapters_topic_idx" ON "learning_chapters" USING btree ("topic_id","sort_order");--> statement-breakpoint
ALTER TABLE "learning_topics" DROP COLUMN IF EXISTS "document_id";