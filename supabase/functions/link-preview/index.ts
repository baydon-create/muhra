// Muhra HQ — rich previews for reference links (Instagram, TikTok, YouTube, any web page).
// Returns thumbnail, account, views, likes, comments for a link and caches it in public.hq_link_previews.
//   Instagram: a post we already track (ci_posts) is answered from the database for free;
//              otherwise Apify's instagram-scraper (APIFY_TOKEN, same token as ugc-discover).
//   TikTok:    Apify's tiktok-scraper, falling back to TikTok's public oEmbed (thumbnail + account only).
//   YouTube:   public oEmbed (thumbnail, title, channel).
//   Other:     the page's Open Graph tags.
// Thumbnails are copied to the public ci-thumbs bucket so they never expire.
// Team members only. POST { url, refresh? } -> preview row
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const FRESH_MS = 24 * 3600e3;   // stats are refreshed at most once a day
// deno-lint-ignore no-explicit-any
type Any = any;
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? Math.round(v) : (typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null));

export function normalize(raw: string) {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
  if (host.endsWith('instagram.com')) {
    const m = u.pathname.match(/\/(?:[^/]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    if (m) return { url: `https://www.instagram.com/${m[1] === 'p' ? 'p' : 'reel'}/${m[2]}/`, platform: 'instagram', code: m[2] };
    return { url: `https://www.instagram.com${u.pathname.replace(/\/+$/, '')}/`, platform: 'instagram', code: null };
  }
  if (host.endsWith('tiktok.com')) return { url: `https://${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, '')}`, platform: 'tiktok', code: null };
  if (host === 'youtu.be' || host.endsWith('youtube.com')) {
    const id = host === 'youtu.be' ? u.pathname.slice(1) : (u.searchParams.get('v') || (u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]+)/) || [])[1]);
    return { url: id ? `https://www.youtube.com/watch?v=${id}` : u.href, platform: 'youtube', code: id || null };
  }
  u.hash = '';
  return { url: u.href, platform: 'web', code: null };
}

async function apify(actor: string, input: unknown) {
  const token = Deno.env.get('APIFY_TOKEN');
  if (!token) throw new Error('APIFY_TOKEN missing');
  const r = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=100&clean=true`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`Apify ${r.status}: ${t.slice(0, 200)}`);
  const items = JSON.parse(t);
  return Array.isArray(items) ? items : [];
}

async function instagram(db: Any, n: { url: string; code: string | null }) {
  if (n.code) {
    const { data: p } = await db.from('ci_posts')
      .select('caption,format,permalink,thumb_url,thumbnail_url,media_url,posted_at,like_count,comments_count,view_count,ci_competitors(username)')
      .ilike('permalink', `%/${n.code}/%`).limit(1).maybeSingle();
    if (p) return {
      source: 'tracked', account: p.ci_competitors?.username ? '@' + p.ci_competitors.username : null, title: p.caption,
      img: p.thumb_url || p.thumbnail_url || p.media_url, views: p.view_count, likes: p.like_count, comments: p.comments_count,
      format: p.format, posted_at: p.posted_at,
    };
  }
  const [x] = await apify('apify~instagram-scraper', { directUrls: [n.url], resultsType: 'posts', resultsLimit: 1, addParentData: false });
  if (!x || x.error) throw new Error(x?.errorDescription || x?.error || 'post not found or private');
  const video = /video/i.test(x.type || '') || x.productType === 'clips';
  return {
    source: 'apify', account: x.ownerUsername ? '@' + x.ownerUsername : null, title: x.caption || null,
    img: x.displayUrl || (x.images || [])[0] || null,
    views: num(x.videoPlayCount) ?? num(x.videoViewCount), likes: num(x.likesCount), comments: num(x.commentsCount),
    format: x.productType === 'clips' ? 'Reel' : /sidecar/i.test(x.type || '') ? 'Carousel' : video ? 'Video' : 'Image',
    posted_at: x.timestamp || null,
  };
}

async function oembed(endpoint: string) {
  const r = await fetch(endpoint, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('oEmbed ' + r.status);
  return await r.json();
}

async function tiktok(n: { url: string }) {
  try {
    const [x] = await apify('clockworks~tiktok-scraper', { postURLs: [n.url], resultsPerPage: 1, shouldDownloadVideos: false, shouldDownloadCovers: false });
    if (x && !x.error) return {
      source: 'apify', account: x.authorMeta?.name ? '@' + x.authorMeta.name : null, title: x.text || null,
      img: x.videoMeta?.coverUrl || x.videoMeta?.originalCoverUrl || null,
      views: num(x.playCount), likes: num(x.diggCount), comments: num(x.commentCount), shares: num(x.shareCount),
      format: 'Video', posted_at: x.createTimeISO || null,
    };
  } catch (e) { console.warn('tiktok apify', String(e)); }
  const o = await oembed('https://www.tiktok.com/oembed?url=' + encodeURIComponent(n.url));
  return { source: 'oembed', partial: true, account: o.author_unique_id ? '@' + o.author_unique_id : o.author_name, title: o.title, img: o.thumbnail_url, format: 'Video' };
}

async function youtube(n: { url: string }) {
  const o = await oembed('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(n.url));
  return { source: 'oembed', partial: true, account: o.author_name, title: o.title, img: o.thumbnail_url, format: 'Video' };
}

async function web(n: { url: string }) {
  const r = await fetch(n.url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow' });
  if (!r.ok) throw new Error('page ' + r.status);
  const html = (await r.text()).slice(0, 400_000);
  const meta = (k: string) => {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']+)["']`, 'i'))
      || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${k}["']`, 'i'));
    return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'") : null;
  };
  const title = meta('og:title') || (html.match(/<title[^>]*>([^<]+)/i) || [])[1] || null;
  let img = meta('og:image') || meta('twitter:image');
  if (img && !/^https?:/.test(img)) { try { img = new URL(img, n.url).href; } catch { img = null; } }
  return { source: 'og', partial: true, account: meta('og:site_name') || new URL(n.url).hostname.replace(/^www\./, ''), title, img, format: null };
}

async function keepImage(db: Any, src: string | null, key: string) {
  if (!src) return null;
  try {
    if (src.includes('/storage/v1/object/public/')) return src;   // already ours
    const r = await fetch(src, { headers: { 'User-Agent': UA, Accept: 'image/jpeg,image/png,image/webp,*/*;q=0.5' } });
    if (!r.ok) return null;
    const type = r.headers.get('content-type') || 'image/jpeg';
    if (!type.startsWith('image/')) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length > 4_000_000) return null;
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
    const path = `links/${key}.${ext}`;
    const up = await db.storage.from('ci-thumbs').upload(path, buf, { contentType: type, upsert: true, cacheControl: '31536000' });
    if (up.error) return null;
    return db.storage.from('ci-thumbs').getPublicUrl(path).data.publicUrl;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const base = Deno.env.get('SUPABASE_URL')!;
  const user = createClient(base, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const db = createClient(base, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: ok } = await user.rpc('hq_is_member');
  if (!ok) {
    // server-side callers (scheduled jobs) use the internal secret instead of a member login
    const { data: sec } = await db.from('hq_private').select('value').eq('key', 'ci_thumb_secret').maybeSingle();
    if (!sec?.value || req.headers.get('x-ci-secret') !== sec.value) return json({ error: 'Team members only.' }, 403);
  }

  let body: Any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const n = normalize(String(body.url || ''));
  if (!n) return json({ error: 'Not a valid link.' }, 400);

  const { data: cached } = await db.from('hq_link_previews').select('*').eq('url', n.url).maybeSingle();
  if (cached && !body.refresh && (cached.status !== 'failed' || Date.now() - Date.parse(cached.fetched_at) < 3600e3)
      && Date.now() - Date.parse(cached.fetched_at) < FRESH_MS) return json(cached);

  let row: Any;
  try {
    const d: Any = n.platform === 'instagram' ? await instagram(db, n) : n.platform === 'tiktok' ? await tiktok(n) : n.platform === 'youtube' ? await youtube(n) : await web(n);
    const key = (n.code || n.url).replace(/[^\w-]+/g, '_').slice(-80);
    const thumb = await keepImage(db, d.img, n.platform + '_' + key) || cached?.thumb || null;
    row = {
      url: n.url, platform: n.platform, status: d.partial ? 'partial' : 'ok', account: d.account || null,
      title: d.title ? String(d.title).slice(0, 600) : null, thumb, views: d.views ?? null, likes: d.likes ?? null,
      comments: d.comments ?? null, shares: d.shares ?? null, format: d.format || null, posted_at: d.posted_at || null,
      source: d.source, error: null, fetched_at: new Date().toISOString(),
    };
  } catch (e) {
    // keep whatever we had before; just note the failure
    row = { ...(cached || {}), url: n.url, platform: n.platform, status: cached && cached.status !== 'failed' ? cached.status : 'failed',
      error: String((e as Error).message || e).slice(0, 300), fetched_at: new Date().toISOString() };
  }
  const { error } = await db.from('hq_link_previews').upsert(row, { onConflict: 'url' });
  if (error) console.error('save preview', error.message);
  return json(row);
});
