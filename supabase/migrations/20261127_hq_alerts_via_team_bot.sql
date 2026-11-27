-- HQ content alerts and the morning digest go through the team bot (@Muhra_team_bot) only.
-- n8n builds the message and calls this function; the bot token never leaves the database.
-- Recipients: active content approvers who linked Telegram in HQ.
create or replace function public.hq_tg_alert(p_secret text, p_text text, p_url text default null, p_button text default null)
returns int
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  tok text; c record; n int := 0;
  link text := case when p_url like 'https://baydon-create.github.io/muhra/%' then left(p_url, 300) else 'https://baydon-create.github.io/muhra/hq.html' end;
begin
  if p_secret is null or p_secret <> (select value from hq_private where key = 'digest_secret') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(trim(p_text), '') = '' then return 0; end if;
  select value into tok from hq_private where key = 'tg_bot_token';
  if tok is null then return 0; end if;
  for c in
    select t.chat_id from hq_telegram t join team_members m on m.id = t.member_id
    where t.chat_id is not null and m.active and m.can_approve
  loop
    perform net.http_post(
      url := 'https://api.telegram.org/bot' || tok || '/sendMessage',
      body := jsonb_build_object('chat_id', c.chat_id, 'text', left(p_text, 4000), 'parse_mode', 'HTML',
        'disable_web_page_preview', true,
        'reply_markup', jsonb_build_object('inline_keyboard', jsonb_build_array(jsonb_build_array(
          jsonb_build_object('text', coalesce(nullif(p_button, ''), 'افتح Muhra HQ'), 'url', link))))),
      headers := jsonb_build_object('Content-Type', 'application/json'));
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.hq_tg_alert(text, text, text, text) from public;
grant execute on function public.hq_tg_alert(text, text, text, text) to anon, authenticated;
