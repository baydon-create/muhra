// Muhra HQ — Shopify product catalog sync.
// Copies every Shopify product (title, price, stock, collections, all images) into
// public.hq_products so the hub can link products to content cards and tasks and
// reuse their photos anywhere. Only signed-in team members can trigger a sync.
// Uses the same Shopify secrets as shopify-lookup:
//   SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET (client credentials) or SHOPIFY_ADMIN_TOKEN, SHOPIFY_DOMAIN
//
// POST { action: 'sync' } -> { synced, removed }
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const STATIC_TOKEN = (Deno.env.get('SHOPIFY_ADMIN_TOKEN') ?? '').trim();
const CLIENT_ID = (Deno.env.get('SHOPIFY_CLIENT_ID') ?? '').trim();
const CLIENT_SECRET = (Deno.env.get('SHOPIFY_CLIENT_SECRET') ?? '').trim();
const DOMAIN = (Deno.env.get('SHOPIFY_DOMAIN') ?? '').trim() || 'muhrastore-2.myshopify.com';
const GQL = `https://${DOMAIN}/admin/api/2025-01/graphql.json`;

let cachedToken = '';
let cachedUntil = 0;
async function getToken(force = false): Promise<string> {
  if (CLIENT_ID && CLIENT_SECRET) {
    if (!force && cachedToken && Date.now() < cachedUntil) return cachedToken;
    try {
      const r = await fetch(`https://${DOMAIN}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
      });
      if (!r.ok) throw new Error(`token ${r.status}`);
      const d = await r.json();
      cachedToken = d.access_token;
      cachedUntil = Date.now() + (Number(d.expires_in) || 86_399) * 1000 - 600_000;
      return cachedToken;
    } catch (e) {
      if (!STATIC_TOKEN) throw e;
    }
  }
  if (!STATIC_TOKEN) throw new Error('Shopify is not connected: missing SHOPIFY secrets.');
  return STATIC_TOKEN;
}
// deno-lint-ignore no-explicit-any
async function gql(query: string, variables: Record<string, unknown> = {}): Promise<any> {
  const send = (t: string) => fetch(GQL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': t }, body: JSON.stringify({ query, variables }) });
  let r = await send(await getToken());
  if (r.status === 401 && CLIENT_ID) r = await send(await getToken(true));
  if (!r.ok) throw new Error(`Shopify ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  if (d.errors) throw new Error('Shopify: ' + JSON.stringify(d.errors).slice(0, 300));
  return d.data;
}

const Q = `query($after: String) {
  products(first: 50, after: $after, sortKey: UPDATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title status productType vendor tags updatedAt onlineStoreUrl totalInventory
      priceRangeV2 { minVariantPrice { amount } maxVariantPrice { amount } }
      compareAtPriceRange { maxVariantCompareAtPrice { amount } }
      media(first: 25) { nodes { mediaContentType alt ... on MediaImage { image { url width height } } preview { image { url } } } }
      collections(first: 10) { nodes { title } }
      variants(first: 50) { nodes { id title price sku inventoryQuantity } }
    }
  }
}`;

const tail = (gid: string) => String(gid).split('/').pop()!;
const n = (v: unknown) => (v == null || v === '' ? null : Number(v));

// deno-lint-ignore no-explicit-any
function row(p: any) {
  // deno-lint-ignore no-explicit-any
  const images = (p.media?.nodes ?? []).map((m: any) => {
    const url = m.image?.url ?? m.preview?.image?.url;
    return url ? { url, alt: m.alt || '', w: m.image?.width ?? null, h: m.image?.height ?? null, kind: m.mediaContentType } : null;
  }).filter(Boolean);
  return {
    id: tail(p.id),
    handle: p.handle,
    title: p.title,
    status: p.status,
    product_type: p.productType || null,
    vendor: p.vendor || null,
    tags: p.tags ?? [],
    // deno-lint-ignore no-explicit-any
    collections: (p.collections?.nodes ?? []).map((c: any) => c.title),
    price_min: n(p.priceRangeV2?.minVariantPrice?.amount),
    price_max: n(p.priceRangeV2?.maxVariantPrice?.amount),
    compare_at: n(p.compareAtPriceRange?.maxVariantCompareAtPrice?.amount),
    inventory: p.totalInventory ?? null,
    image: images[0]?.url ?? null,
    images,
    // deno-lint-ignore no-explicit-any
    variants: (p.variants?.nodes ?? []).map((v: any) => ({ id: tail(v.id), title: v.title, price: n(v.price), sku: v.sku, inventory: v.inventoryQuantity })),
    url: p.onlineStoreUrl || `https://www.muhrastore.com/products/${p.handle}`,
    shopify_updated_at: p.updatedAt,
    synced_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!;
  const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: ok } = await user.rpc('hq_is_member');
  if (!ok) return json({ error: 'Team members only.' }, 403);
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const seen: string[] = [];
    let after: string | null = null;
    for (let page = 0; page < 40; page++) {
      const d = await gql(Q, { after });
      const rows = (d.products.nodes ?? []).map(row);
      if (rows.length) {
        const { error } = await db.from('hq_products').upsert(rows, { onConflict: 'id' });
        if (error) throw error;
        seen.push(...rows.map((r: { id: string }) => r.id));
      }
      if (!d.products.pageInfo.hasNextPage) { after = null; break; }
      after = d.products.pageInfo.endCursor;
    }
    let removed = 0;
    if (seen.length && !after) {
      // Products deleted in Shopify disappear from the hub too (links on cards keep the id).
      const { data: gone } = await db.from('hq_products').delete().not('id', 'in', `(${seen.join(',')})`).select('id');
      removed = gone?.length ?? 0;
    }
    return json({ synced: seen.length, removed });
  } catch (e) {
    console.error('shopify-products', String(e));
    return json({ error: String((e as Error).message || e) }, 502);
  }
});
