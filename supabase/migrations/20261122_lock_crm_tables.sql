-- Lock CRM tables to signed-in team members (applied 2026-11-22). Both were open to anyone with the public key.
drop policy if exists cache_anon_all on public.crm_shopify_cache;
drop policy if exists crm_anon_all on public.crm_customers;
revoke all on public.crm_shopify_cache from anon;
revoke all on public.crm_customers from anon;
create policy crm_shopify_cache_team on public.crm_shopify_cache for all to authenticated using (hq_is_member()) with check (hq_is_member());
create policy crm_customers_team on public.crm_customers for all to authenticated using (hq_is_member()) with check (hq_is_member());
