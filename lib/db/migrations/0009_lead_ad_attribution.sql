-- Ad-set and ad level attribution on leads.
--
-- `utm_campaign` alone is too coarse to act on. A property campaign typically runs
-- one ad set per project or per audience and several creatives inside it, so the
-- campaign total hides the fact that one ad set produces every appointment and the
-- other produces nothing. The decision an agency actually makes — pause this ad set,
-- put the budget in that one — needs the level below campaign.
--
-- Mapped onto the standard UTM vocabulary rather than meta-specific column names:
--   utm_content = ad set   (Meta `adset_name`, Google ad group)
--   utm_term    = ad       (Meta `ad_name`, Google creative)
-- so Google Ads, TikTok and plain website links all land in the same two columns.
--
-- Meta's provider already fetches adset_name and ad_name from the Graph API; the
-- mapper was discarding them for want of somewhere to put them.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "utm_content" varchar(255);--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "utm_term" varchar(255);--> statement-breakpoint
-- Cost-per-lead reporting groups live leads by campaign. Partial, because every
-- report excludes deleted rows and there is no reason to index them.
CREATE INDEX IF NOT EXISTS "leads_utm_campaign_idx" ON "leads" USING btree ("utm_campaign") WHERE deleted_at is null;
