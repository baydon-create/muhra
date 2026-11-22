-- Shopify products in Muhra HQ (applied 2026-11-22)
create table if not exists public.hq_products (
  id text primary key, handle text, title text not null, status text, product_type text, vendor text,
  tags text[] default '{}', collections text[] default '{}', price_min numeric, price_max numeric, compare_at numeric,
  inventory integer, image text, images jsonb default '[]', variants jsonb default '[]', url text,
  shopify_updated_at timestamptz, synced_at timestamptz default now()
);
alter table public.hq_products enable row level security;
create policy hq_products_read on public.hq_products for select to authenticated using (hq_is_member());
create index if not exists hq_products_title_idx on public.hq_products (lower(title));
alter table public.hq_content add column if not exists product_ids text[] default '{}';
alter table public.tasks add column if not exists product_ids text[] default '{}';
alter publication supabase_realtime add table public.hq_products;
