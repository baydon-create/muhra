-- Drive publishing queue (n8n) -> content cards. Applied 2026-11-22.
-- See the live definitions of hq_publish_apply() and hq_publish_sync() in Supabase; summary:
--   * hq_content.publish_folder_id links a card to its MUHRA SOCIAL/<date>/<product> folder.
--   * hq_publish_sync (called by the n8n "Publishing Queue Sync" every 20 min) now ends with hq_publish_apply().
--   * hq_publish_apply(): folder in the queue -> card 'scheduled' (publish_date = folder date, counted as approved);
--     folder or all its media marked [POSTED] -> card 'posted'. Matches an open card by Shopify product title,
--     product field or card title; creates a card when none exists. Never moves a posted card back.
alter table public.hq_content add column if not exists publish_folder_id text;
create index if not exists hq_content_publish_folder_idx on public.hq_content (publish_folder_id);
