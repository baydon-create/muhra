-- Shoot plans (خطط التصوير): one plan = one shoot that produces many content cards.
-- Stages: ideas → planning → prep → shoot_day → selects → publishing → done.
-- The budget lives in its own table that only admins and approvers can read.

create or replace function public.hq_can_approve()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.team_members where user_id = auth.uid() and active and (can_approve or role = 'admin'))
$$;

create table if not exists public.hq_shoots (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  stage text not null default 'ideas' check (stage in ('ideas','planning','prep','shoot_day','selects','publishing','done','archived')),
  owner text,
  brief text,
  shoot_date date,
  call_time text,
  location text,
  location_url text,
  raw_link text,
  notes text,
  product_ids text[] not null default '{}',          -- outfits / products to bring (Shopify ids)
  ideas jsonb not null default '[]',                  -- [{id,title,url,note,item_id,by,at}]
  shots jsonb not null default '[]',                  -- [{id,title,note,type,product_ids,owner,done,selected,item_id,by,at}]
  crew jsonb not null default '[]',                   -- [{id,name,role,phone,member_id,by,at}]
  equipment jsonb not null default '[]',              -- [{id,title,done,by,at}]
  submitted_at timestamptz,
  submitted_by text,
  approved_at timestamptz,
  approved_by text,
  changes_note text,
  reminded_on date,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  stage_at timestamptz not null default now()
);
create index if not exists hq_shoots_stage_idx on public.hq_shoots(stage);
create index if not exists hq_shoots_date_idx on public.hq_shoots(shoot_date);

create table if not exists public.hq_shoot_budget (
  shoot_id uuid primary key references public.hq_shoots(id) on delete cascade,
  lines jsonb not null default '[]',                  -- [{id,label,amount,note,by,at}]
  currency text not null default 'EGP',
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.hq_content add column if not exists shoot_id uuid references public.hq_shoots(id) on delete set null;
create index if not exists hq_content_shoot_idx on public.hq_content(shoot_id) where shoot_id is not null;

-- Access: shoot plans for team members, budget for admins and approvers only
alter table public.hq_shoots enable row level security;
alter table public.hq_shoot_budget enable row level security;
revoke all on public.hq_shoots, public.hq_shoot_budget from anon;
drop policy if exists hq_shoots_read on public.hq_shoots;
drop policy if exists hq_shoots_ins on public.hq_shoots;
drop policy if exists hq_shoots_upd on public.hq_shoots;
drop policy if exists hq_shoots_del on public.hq_shoots;
create policy hq_shoots_read on public.hq_shoots for select to authenticated using (hq_is_member());
create policy hq_shoots_ins on public.hq_shoots for insert to authenticated with check (hq_is_member());
create policy hq_shoots_upd on public.hq_shoots for update to authenticated using (hq_is_member()) with check (hq_is_member());
create policy hq_shoots_del on public.hq_shoots for delete to authenticated using (hq_is_admin());
drop policy if exists hq_shoot_budget_all on public.hq_shoot_budget;
create policy hq_shoot_budget_all on public.hq_shoot_budget for all to authenticated using (hq_can_approve()) with check (hq_can_approve());

-- Guard: stamps, approval only by approvers, no skipping approval
create or replace function public.hq_shoots_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare me text := hq_me();
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := coalesce(me, new.created_by);
    new.approved_at := null; new.approved_by := null;
    if new.stage not in ('ideas','planning') then new.stage := 'ideas'; end if;
    return new;
  end if;
  if new.approved_at is distinct from old.approved_at or new.approved_by is distinct from old.approved_by then
    if not hq_can_approve() then raise exception 'only_approvers_can_approve' using errcode = '42501'; end if;
    if new.approved_at is not null then new.approved_by := me; new.changes_note := null; end if;
  end if;
  if new.stage is distinct from old.stage then
    new.stage_at := now();
    if new.stage in ('prep','shoot_day','selects','publishing','done') and new.approved_at is null then
      raise exception 'needs_approval' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists hq_shoots_guard on public.hq_shoots;
create trigger hq_shoots_guard before insert or update on public.hq_shoots for each row execute function public.hq_shoots_guard();

create or replace function public.hq_shoot_budget_touch()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); new.updated_by := hq_me(); return new; end $$;
drop trigger if exists hq_shoot_budget_touch on public.hq_shoot_budget;
create trigger hq_shoot_budget_touch before insert or update on public.hq_shoot_budget for each row execute function public.hq_shoot_budget_touch();

-- Lists inside a plan (ideas, shots, crew, equipment) are edited one entry at a time under a row lock,
-- so two people ticking shots on shoot day never overwrite each other.
create or replace function public.hq_shoot_patch(p_shoot uuid, p_list text, p_op text, p_entry jsonb default null, p_id text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare me text := hq_me(); cur jsonb; e jsonb; out_arr jsonb;
begin
  if me is null then raise exception 'not_a_member'; end if;
  if p_list not in ('ideas','shots','crew','equipment') then raise exception 'bad_list'; end if;
  execute format('select coalesce(%I, ''[]''::jsonb) from hq_shoots where id = $1 for update', p_list) into cur using p_shoot;
  if cur is null then raise exception 'not_found'; end if;
  if p_op = 'add' then
    e := (coalesce(p_entry, '{}'::jsonb) - 'id' - 'by' - 'at') || jsonb_build_object('id', encode(extensions.gen_random_bytes(6), 'hex'), 'by', me, 'at', now());
    out_arr := cur || jsonb_build_array(e);
  elsif p_op = 'update' then
    select coalesce(jsonb_agg(case when x->>'id' = p_id then x || (coalesce(p_entry, '{}'::jsonb) - 'id' - 'by' - 'at') else x end order by o), '[]'::jsonb)
      into out_arr from jsonb_array_elements(cur) with ordinality t(x, o);
  elsif p_op = 'remove' then
    select coalesce(jsonb_agg(x order by o), '[]'::jsonb) into out_arr
      from jsonb_array_elements(cur) with ordinality t(x, o) where x->>'id' is distinct from p_id;
  elsif p_op = 'move' then     -- p_entry = {"dir": -1 | 1}
    with a as (select x, o from jsonb_array_elements(cur) with ordinality t(x, o)),
         me_row as (select o from a where x->>'id' = p_id),
         swap as (select a.o from a, me_row where a.o = me_row.o + coalesce((p_entry->>'dir')::int, 0))
    select coalesce(jsonb_agg(x order by case when o = (select o from me_row) then (select o from swap) when o = (select o from swap) then (select o from me_row) else o end), '[]'::jsonb)
      into out_arr from a;
  else raise exception 'bad_op'; end if;
  execute format('update hq_shoots set %I = $1 where id = $2', p_list) using out_arr, p_shoot;
  return out_arr;
end $$;

-- Selects → content cards. Each chosen shot becomes a card at «مونتاج» linked to the shoot.
-- A shot that came from an existing idea card moves that card instead of making a new one.
create or replace function public.hq_shoot_make_cards(p_shoot uuid, p_shot_ids text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := hq_me(); sh record; s jsonb; cid uuid; made jsonb := '[]'; v_shots jsonb; t text;
begin
  if me is null then raise exception 'not_a_member'; end if;
  select * into sh from hq_shoots where id = p_shoot for update;
  if not found then raise exception 'not_found'; end if;
  if sh.approved_at is null then raise exception 'needs_approval' using errcode = '42501'; end if;
  v_shots := sh.shots;
  for s in select x from jsonb_array_elements(v_shots) x where x->>'id' = any(p_shot_ids) and coalesce(x->>'made_item', '') = '' loop
    t := coalesce(nullif(s->>'type', ''), 'reel');
    if t not in ('reel','post','carousel','story','ad','tiktok') then t := 'reel'; end if;
    cid := null;
    if coalesce(s->>'item_id', '') <> '' then
      update hq_content set stage = 'edit', shoot_id = p_shoot,
        owner = coalesce(nullif(s->>'owner', ''), owner),
        drive_link = coalesce(drive_link, sh.raw_link)
      where id = (s->>'item_id')::uuid and stage in ('idea','script','shoot') returning id into cid;
    end if;
    if cid is null then
      insert into hq_content (title, type, stage, owner, created_by, shoot_id, brief, product_ids, product, drive_link, platforms)
      values (left(coalesce(nullif(s->>'title', ''), sh.title), 200), t, 'edit', nullif(s->>'owner', ''), me, p_shoot,
              nullif(concat_ws(E'\n', nullif(s->>'note', ''), 'من التصوير: ' || sh.title), ''),
              coalesce((select array_agg(v) from jsonb_array_elements_text(coalesce(s->'product_ids', '[]')) v), '{}'),
              (select p.title from hq_products p where p.id = (s->'product_ids'->>0) limit 1),
              sh.raw_link, case when t = 'tiktok' then array['tiktok'] else array['instagram'] end)
      returning id into cid;
    end if;
    insert into hq_activity (item_id, actor, action, from_stage, to_stage, note) values (cid, me, 'shoot', null, 'edit', 'من خطة التصوير: ' || sh.title);
    select jsonb_agg(case when x->>'id' = s->>'id' then x || jsonb_build_object('selected', true, 'made_item', cid) else x end order by o)
      into v_shots from jsonb_array_elements(v_shots) with ordinality t2(x, o);
    made := made || jsonb_build_array(jsonb_build_object('shot', s->>'id', 'item', cid, 'owner', nullif(s->>'owner', ''), 'title', s->>'title'));
  end loop;
  update hq_shoots set shots = v_shots, stage = case when stage in ('shoot_day','selects') then 'publishing' else stage end where id = p_shoot;
  return made;
end $$;

-- A shoot finishes by itself when every card it produced is posted
create or replace function public.hq_shoot_autodone()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.shoot_id is not null and new.stage is distinct from old.stage and new.stage in ('posted','archived') then
    update hq_shoots sh set stage = 'done'
    where sh.id = new.shoot_id and sh.stage = 'publishing'
      and not exists (select 1 from hq_content c where c.shoot_id = sh.id and c.stage not in ('posted','archived'));
  end if;
  return new;
end $$;
drop trigger if exists hq_content_shoot_autodone on public.hq_content;
create trigger hq_content_shoot_autodone after update of stage on public.hq_content for each row execute function public.hq_shoot_autodone();

-- Day-before reminder on Telegram for the owner and every team member on the call sheet
create or replace function public.hq_shoot_reminders()
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare tok text; sh record; c record; n int := 0; tomorrow date := (now() at time zone 'Africa/Cairo')::date + 1; txt text;
begin
  select value into tok from hq_private where key = 'tg_bot_token';
  if tok is null then return 0; end if;
  for sh in select * from hq_shoots where shoot_date = tomorrow and stage in ('prep','shoot_day') and reminded_on is distinct from tomorrow loop
    txt := '<b>📸 تذكير: تصوير بكرة</b>' || E'\n' || replace(replace(replace(sh.title, '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
      || coalesce(E'\n🕘 ' || nullif(replace(replace(sh.call_time, '<', '&lt;'), '>', '&gt;'), ''), '')
      || coalesce(E'\n📍 ' || nullif(replace(replace(sh.location, '<', '&lt;'), '>', '&gt;'), ''), '');
    for c in
      select distinct t.chat_id from hq_telegram t join team_members m on m.id = t.member_id
      where t.chat_id is not null and m.active
        and (m.id = sh.owner or m.id in (select x->>'member_id' from jsonb_array_elements(sh.crew) x))
    loop
      perform net.http_post(
        url := 'https://api.telegram.org/bot' || tok || '/sendMessage',
        body := jsonb_build_object('chat_id', c.chat_id, 'text', txt, 'parse_mode', 'HTML', 'disable_web_page_preview', true,
          'reply_markup', jsonb_build_object('inline_keyboard', jsonb_build_array(jsonb_build_array(
            jsonb_build_object('text', '📲 افتح خطة التصوير', 'url', 'https://baydon-create.github.io/muhra/#shoot=' || sh.id))))),
        headers := jsonb_build_object('Content-Type', 'application/json'));
      n := n + 1;
    end loop;
    update hq_shoots set reminded_on = tomorrow where id = sh.id;
  end loop;
  return n;
end $$;
revoke execute on function public.hq_shoot_reminders() from public, anon, authenticated;

-- 17:07 Cairo time (15:07 UTC) every day
select cron.unschedule('hq-shoot-reminders') where exists (select 1 from cron.job where jobname = 'hq-shoot-reminders');
select cron.schedule('hq-shoot-reminders', '7 15 * * *', 'select public.hq_shoot_reminders()');

-- Live updates in the hub
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'hq_shoots') then
    alter publication supabase_realtime add table public.hq_shoots;
  end if;
end $$;
