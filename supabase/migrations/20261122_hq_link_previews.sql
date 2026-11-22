-- Rich previews for reference links (applied 2026-11-22).
create table if not exists public.hq_link_previews (
  url text primary key, platform text, status text not null default 'ok', account text, title text, thumb text,
  views bigint, likes bigint, comments bigint, shares bigint, format text, posted_at timestamptz,
  source text, error text, fetched_at timestamptz not null default now()
);
alter table public.hq_link_previews enable row level security;
create policy hq_link_previews_read on public.hq_link_previews for select to authenticated using (hq_is_member());
alter publication supabase_realtime add table public.hq_link_previews;
-- Filled by the link-preview edge function (supabase/functions/link-preview).
