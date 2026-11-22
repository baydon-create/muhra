// Muhra HQ — permanent thumbnails for competitor posts.
// Instagram CDN links (ci_posts.thumbnail_url / media_url) expire after a few days, which left
// "Preview expired" on most posts. While a link still works this function downloads the image,
// shrinks it to 420px wide JPEG and stores it in the public ci-thumbs bucket (ci_posts.thumb_url).
// Called every minute by pg_cron with the x-ci-secret header (hq_private.ci_thumb_secret).
//
// POST { limit?: number } -> { done, failed, skipped }
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { decode, Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';

const WIDTH = 420;
const QUALITY = 65;
const BUDGET_MS = 40_000;

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: sec } = await db.from('hq_private').select('value').eq('key', 'ci_thumb_secret').maybeSingle();
  if (!sec?.value || req.headers.get('x-ci-secret') !== sec.value) return json({ error: 'forbidden' }, 403);

  let body: { limit?: number } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const { data: todo, error } = await db.rpc('ci_thumb_todo', { p_limit: Math.min(Number(body.limit) || 2, 30) });
  if (error) return json({ error: error.message }, 500);

  const t0 = Date.now();
  let done = 0, failed = 0, skipped = 0;
  for (const p of (todo ?? []) as { id: string; src: string; media_type: string; old_urls: string[] }[]) {
    if (Date.now() - t0 > BUDGET_MS) { skipped++; continue; }
    try {
      const r = await fetch(p.src, { headers: { Accept: 'image/jpeg,image/png;q=0.9,*/*;q=0.5', 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) throw new Error('link ' + r.status + (r.status === 403 || r.status === 410 ? ' (expired)' : ''));
      const type = r.headers.get('content-type') || '';
      if (type.startsWith('video/')) {
        await db.from('ci_posts').update({ thumb_error: 'video only, no image', thumb_tries: 50 }).eq('id', p.id);
        failed++; continue;
      }
      const buf = new Uint8Array(await r.arrayBuffer());
      const img = await decode(buf) as Image;
      if (img.width > WIDTH) img.resize(WIDTH, Image.RESIZE_AUTO);
      const jpg = await img.encodeJPEG(QUALITY);
      const path = p.id.replace(/[^\w-]/g, '_') + '.jpg';
      const up = await db.storage.from('ci-thumbs').upload(path, jpg, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' });
      if (up.error) throw up.error;
      const url = db.storage.from('ci-thumbs').getPublicUrl(path).data.publicUrl;
      await db.from('ci_posts').update({ thumb_url: url, thumb_error: null }).eq('id', p.id);
      // content cards made from this post keep their picture too
      if (p.old_urls?.length) await db.from('hq_content').update({ ref_thumb: url }).in('ref_thumb', p.old_urls);
      done++;
    } catch (e) {
      await db.from('ci_posts').update({ thumb_error: String((e as Error).message || e).slice(0, 200) }).eq('id', p.id);
      failed++;
    }
  }
  return json({ done, failed, skipped, ms: Date.now() - t0 });
});
