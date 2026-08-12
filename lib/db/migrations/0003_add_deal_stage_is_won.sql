ALTER TABLE "deal_stages" ADD COLUMN "is_won" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill: any existing terminal stage whose name reads as a win becomes is_won.
-- Safe to run on a fresh database (matches nothing).
UPDATE "deal_stages"
SET "is_won" = true
WHERE "is_terminal" = true
  AND ("name" ILIKE '%won%' OR "name" ILIKE '%win%' OR "name" ILIKE '%success%');
