-- Shoot plans, round 2 (from Donia's notes on shoot day):
-- 1) Every reference is tied to the pieces it is shot on (ideas[].product_ids, shots[].ref_url).
-- 2) Each shot can name the model wearing it (shots[].model = crew entry id).
--    Both live inside the existing jsonb lists, so no table change is needed for them.
-- 3) Content cards say where their footage comes from, so nobody is asked to edit
--    old footage that was shot for a different edit without knowing it.

alter table public.hq_content add column if not exists footage_source text;
alter table public.hq_content add column if not exists footage_note text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'hq_content_footage_source_chk') then
    alter table public.hq_content add constraint hq_content_footage_source_chk
      check (footage_source is null or footage_source in ('new_shoot', 'existing'));
  end if;
end $$;

-- Selects → content cards. Same as before, plus:
-- the card gets the shot's reference, the model's name in the brief, and footage_source = new_shoot.
create or replace function public.hq_shoot_make_cards(p_shoot uuid, p_shot_ids text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := hq_me(); sh record; s jsonb; cid uuid; made jsonb := '[]'; v_shots jsonb; t text; v_model text; v_ref text;
begin
  if me is null then raise exception 'not_a_member'; end if;
  select * into sh from hq_shoots where id = p_shoot for update;
  if not found then raise exception 'not_found'; end if;
  if sh.approved_at is null then raise exception 'needs_approval' using errcode = '42501'; end if;
  v_shots := sh.shots;
  for s in select x from jsonb_array_elements(v_shots) x where x->>'id' = any(p_shot_ids) and coalesce(x->>'made_item', '') = '' loop
    t := coalesce(nullif(s->>'type', ''), 'reel');
    if t not in ('reel','post','carousel','story','ad','tiktok') then t := 'reel'; end if;
    v_model := (select coalesce(nullif(c->>'name', ''), (select m.name from team_members m where m.id = c->>'member_id'))
                from jsonb_array_elements(sh.crew) c where c->>'id' = s->>'model' limit 1);
    v_ref := nullif(s->>'ref_url', '');
    if v_ref is not null and v_ref !~ '^https?://' then v_ref := null; end if;
    cid := null;
    if coalesce(s->>'item_id', '') <> '' then
      update hq_content set stage = 'edit', shoot_id = p_shoot,
        owner = coalesce(nullif(s->>'owner', ''), owner),
        drive_link = coalesce(drive_link, sh.raw_link),
        ref_url = coalesce(ref_url, v_ref),
        footage_source = 'new_shoot'
      where id = (s->>'item_id')::uuid and stage in ('idea','script','shoot') returning id into cid;
    end if;
    if cid is null then
      insert into hq_content (title, type, stage, owner, created_by, shoot_id, brief, product_ids, product, drive_link, platforms, ref_url, footage_source)
      values (left(coalesce(nullif(s->>'title', ''), sh.title), 200), t, 'edit', nullif(s->>'owner', ''), me, p_shoot,
              nullif(concat_ws(E'\n', nullif(s->>'note', ''), 'الموديل: ' || v_model, 'من التصوير: ' || sh.title), ''),
              coalesce((select array_agg(v) from jsonb_array_elements_text(coalesce(s->'product_ids', '[]')) v), '{}'),
              (select p.title from hq_products p where p.id = (s->'product_ids'->>0) limit 1),
              sh.raw_link, case when t = 'tiktok' then array['tiktok'] else array['instagram'] end,
              v_ref, 'new_shoot')
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

-- "The footage isn't enough": the editor sends a card back to a shoot plan in one step.
-- The card goes to «تصوير», keeps a note of what is missing, and shows up in the plan's ideas
-- with its pieces, so it gets a reference → piece → shot like everything else.
create or replace function public.hq_content_needs_shoot(p_item uuid, p_shoot uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare me text := hq_me(); it record; sh record; v_note text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
begin
  if me is null then raise exception 'not_a_member'; end if;
  select * into it from hq_content where id = p_item for update;
  if not found then raise exception 'not_found'; end if;
  select * into sh from hq_shoots where id = p_shoot for update;
  if not found or sh.stage not in ('ideas','planning','prep','shoot_day') then raise exception 'shoot_not_open'; end if;
  update hq_content set shoot_id = p_shoot, footage_source = 'new_shoot', footage_note = v_note,
    stage = case when stage in ('edit','review') then 'shoot' else stage end
  where id = p_item;
  if not exists (select 1 from jsonb_array_elements(sh.ideas) x where x->>'item_id' = p_item::text) then
    update hq_shoots set ideas = ideas || jsonb_build_array(jsonb_build_object(
      'id', encode(extensions.gen_random_bytes(6), 'hex'), 'by', me, 'at', now(),
      'title', it.title, 'url', it.ref_url, 'item_id', p_item,
      'note', coalesce('ناقص: ' || v_note, 'محتاج تصوير جديد'),
      'product_ids', to_jsonb(coalesce(it.product_ids, '{}'::text[]))))
    where id = p_shoot;
  end if;
  insert into hq_activity (item_id, actor, action, from_stage, to_stage, note)
  values (p_item, me, 'needs_shoot', it.stage, case when it.stage in ('edit','review') then 'shoot' else it.stage end,
          'الفوتيج مش كفاية → ' || sh.title || coalesce(' — ' || v_note, ''));
  return jsonb_build_object('shoot', p_shoot, 'owner', sh.owner, 'stage', case when it.stage in ('edit','review') then 'shoot' else it.stage end);
end $$;
revoke execute on function public.hq_content_needs_shoot(uuid, uuid, text) from public, anon;
grant execute on function public.hq_content_needs_shoot(uuid, uuid, text) to authenticated;
