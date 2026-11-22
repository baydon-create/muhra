'use strict';
/* Shopify products inside the hub: a catalog page, product links on content cards and tasks,
   and a photo picker so product images can be used in stage files, task images, comments and chat.
   Products are copied from Shopify into hq_products by the shopify-products edge function. */

const PROD_SYNC_EVERY = 6 * 3600e3;      // refresh the catalog in the background when older than this
const PROD_STATUS_AR = { ACTIVE: 'منشور', DRAFT: 'مسودة', ARCHIVED: 'مؤرشف' };
S.products = []; S.prodMap = {};
S.prodFilter = { q: '', col: '', status: 'ACTIVE', stock: '' };

/* ───────── DATA ───────── */
async function loadProducts() {
  const all = [];
  for (let from = 0; from < 5000; from += 1000) {
    const { data, error } = await sb.from('hq_products').select('*').order('title').range(from, from + 999);
    if (error) { console.error(error); break; }
    all.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  S.products = all; S.prodMap = Object.fromEntries(all.map(p => [p.id, p]));
  const last = all.reduce((m, p) => Math.max(m, new Date(p.synced_at || 0).getTime()), 0);
  S.prodSyncedAt = last || null;
  if (!S._prodAutoSync && (!last || Date.now() - last > PROD_SYNC_EVERY)) { S._prodAutoSync = true; syncProducts(true); }
}
async function syncProducts(quiet) {
  if (S._prodSyncing) return;
  S._prodSyncing = true; if (S.route === 'products') renderAll();
  if (!quiet) toast('جاري تحديث المنتجات من Shopify…', 2500);
  try {
    const { data, error } = await sb.functions.invoke('shopify-products', { body: { action: 'sync' } });
    if (error || (data && data.error)) throw new Error((data && data.error) || (error && error.message) || 'sync failed');
    await loadProducts();
    if (!quiet) toast('اتحدث ' + data.synced + ' منتج ✓');
  } catch (e) {
    console.error('product sync', e);
    if (!quiet) toast('تعذر التحديث من Shopify — حاول تاني', 3500);
  } finally { S._prodSyncing = false; renderAll(); }
}
const prod = id => S.prodMap[id] || null;
const egp = v => v == null ? '' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' ج.م';
function prodPrice(p) { return p.price_min != null && p.price_max != null && p.price_min !== p.price_max ? egp(p.price_min) + ' – ' + egp(p.price_max) : egp(p.price_min); }
const prodImgs = p => (p && p.images || []).filter(i => i && i.url);
/* Shopify CDN can resize: ask for a small copy for thumbnails. */
function shopImg(u, w) { if (!u || !/cdn\.shopify\.com/.test(u)) return u; try { const x = new URL(u); x.searchParams.set('width', w); return x.href; } catch { return u; } }
/* A file record for a product photo that the hub's file tiles recognise as an image. */
function prodImageFile(p, img, i) {
  const ext = ((img.url.split('?')[0].match(/\.(jpe?g|png|webp|gif)$/i) || [])[0] || '.jpg');
  return { name: (p ? p.title : 'product') + ' ' + (i + 1) + ext, url: img.url, type: 'image/' + ext.slice(1).replace('jpg', 'jpeg'), product_id: p ? p.id : null };
}
const contentFor = id => S.items.filter(i => (i.product_ids || []).includes(id));
const tasksFor = id => S.tasks.filter(t => (t.product_ids || []).includes(id));
const allCollections = () => [...new Set(S.products.flatMap(p => p.collections || []))].sort();
function stockPill(p) {
  if (p.inventory == null) return '';
  return '<span class="pill ' + (p.inventory <= 0 ? 'late' : p.inventory <= 3 ? 'soon' : 'okp') + '">' + (p.inventory <= 0 ? 'نفد' : 'مخزون ' + p.inventory) + '</span>';
}

/* ───────── PAGE ───────── */
function viewProducts(v) {
  const f = S.prodFilter, q = f.q.trim().toLowerCase();
  if (S.routeArg && S.routeArg !== S._prodArgDone && prod(S.routeArg)) { S._prodArgDone = S.routeArg; setTimeout(() => openProduct(S.routeArg), 0); }
  let list = S.products.filter(p =>
    (!f.status || p.status === f.status) &&
    (!f.col || (p.collections || []).includes(f.col)) &&
    (!f.stock || (f.stock === 'out' ? p.inventory != null && p.inventory <= 0 : f.stock === 'linked' ? contentFor(p.id).length || tasksFor(p.id).length : f.stock === 'none' ? !contentFor(p.id).length : true)) &&
    (!q || [p.title, p.product_type, p.handle, ...(p.tags || []), ...(p.collections || []), ...(p.variants || []).map(x => x.sku)].some(x => String(x || '').toLowerCase().includes(q))));
  const cols = allCollections();
  const synced = S.prodSyncedAt ? 'آخر تحديث ' + fmtTime(S.prodSyncedAt) : 'لسه متحدثتش';
  v.innerHTML =
    '<div class="toolbar"><input class="inp" id="pq" placeholder="ابحث باسم المنتج، SKU، كوليكشن…" value="' + esc(f.q) + '" style="flex:1;min-width:180px">' +
    '<select class="mini" id="pCol"><option value="">كل الكوليكشنز</option>' + cols.map(c => '<option' + (c === f.col ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select>' +
    '<button class="btn sm" id="pSync"' + (S._prodSyncing ? ' disabled' : '') + '>' + (S._prodSyncing ? 'جاري التحديث…' : '↻ تحديث من Shopify') + '</button></div>' +
    '<div class="chips">' +
      [['ACTIVE', 'منشور'], ['DRAFT', 'مسودة'], ['', 'الكل']].map(([k, n]) => '<button class="chip' + (f.status === k ? ' on' : '') + '" data-pst="' + k + '">' + n + ' <span class="c">' + (k ? S.products.filter(p => p.status === k).length : S.products.length) + '</span></button>').join('') +
      [['linked', 'عليه محتوى أو مهام'], ['none', 'من غير محتوى'], ['out', 'نفد']].map(([k, n]) => '<button class="chip' + (f.stock === k ? ' on' : '') + '" data-pstock="' + k + '">' + n + '</button>').join('') +
    '</div>' +
    '<div class="muted small" style="margin:2px 0 10px">' + list.length + ' منتج · ' + synced + '</div>' +
    (S.products.length ? (list.length ? '<div class="rgrid pgrid">' + list.slice(0, 300).map(prodCard).join('') + '</div>' : '<div class="empty">مفيش منتجات بالفلتر ده</div>')
      : '<div class="empty">' + (S._prodSyncing ? 'جاري تحميل المنتجات من Shopify…' : 'مفيش منتجات لسه — دوس «تحديث من Shopify»') + '</div>');
  const pq = $('#pq', v);
  pq.oninput = () => { f.q = pq.value; debounce('pq', () => { renderAll(); const n = $('#pq'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); };
  $('#pCol', v).onchange = e => { f.col = e.target.value; renderAll(); };
  $('#pSync', v).onclick = () => syncProducts(false);
  $$('[data-pst]', v).forEach(b => b.onclick = () => { f.status = b.dataset.pst; renderAll(); });
  $$('[data-pstock]', v).forEach(b => b.onclick = () => { f.stock = f.stock === b.dataset.pstock ? '' : b.dataset.pstock; renderAll(); });
  $$('[data-prod]', v).forEach(el => el.onclick = () => openProduct(el.dataset.prod));
}
function prodCard(p) {
  const nc = contentFor(p.id).length, nt = tasksFor(p.id).length;
  return '<div class="card rcard pcard" data-prod="' + esc(p.id) + '"><div class="img" style="background-image:url(\'' + esc(shopImg(p.image, 400) || '') + '\')">' +
    (prodImgs(p).length > 1 ? '<span class="fmt">' + prodImgs(p).length + ' صور</span>' : '') +
    (p.status !== 'ACTIVE' ? '<span class="er">' + esc(PROD_STATUS_AR[p.status] || p.status) + '</span>' : '') + '</div>' +
    '<div class="bd"><div class="pt" dir="auto">' + esc(p.title) + '</div>' +
    '<div class="st"><b>' + esc(prodPrice(p)) + '</b>' + (p.inventory != null ? '<span>' + (p.inventory <= 0 ? 'نفد' : 'مخزون ' + p.inventory) + '</span>' : '') + '</div>' +
    ((nc || nt) ? '<div class="st">' + (nc ? '<span>🎬 ' + nc + ' محتوى</span>' : '') + (nt ? '<span>☑ ' + nt + ' مهمة</span>' : '') + '</div>' : '') + '</div></div>';
}

/* ───────── PRODUCT SHEET ───────── */
function openProduct(id) {
  const p = prod(id); if (!p) return toast('المنتج مش موجود — حدّث المنتجات');
  const imgs = prodImgs(p), cs = contentFor(id), ts = tasksFor(id);
  const root = sheet('<div class="sh"><b class="grow" dir="auto">' + esc(p.title) + '</b>' +
    (safeUrl(p.url) ? '<a class="btn ghost sm" href="' + esc(safeUrl(p.url)) + '" target="_blank" rel="noopener">المتجر ↗</a>' : '') +
    '<button class="btn ghost sm" id="x">✕</button></div><div class="sb">' +
    '<div class="meta" style="margin:10px 0"><span class="pill"><b>' + esc(prodPrice(p)) + '</b></span>' + (p.compare_at ? '<span class="pill" style="text-decoration:line-through">' + esc(egp(p.compare_at)) + '</span>' : '') +
      stockPill(p) + '<span class="pill">' + esc(PROD_STATUS_AR[p.status] || p.status || '') + '</span>' + (p.product_type ? '<span class="pill">' + esc(p.product_type) + '</span>' : '') + '</div>' +
    ((p.collections || []).length ? '<div class="row wrap" style="gap:6px">' + p.collections.map(c => '<span class="chip-link">' + esc(c) + '</span>').join('') + '</div>' : '') +
    '<div class="sectitle">الصور <span class="muted small">' + imgs.length + '</span></div>' +
    (imgs.length ? '<div class="muted small" style="margin-bottom:6px">اختار صور واستخدمها في كارت محتوى، مهمة أو الشات.</div><div class="pimgs" id="pImgs">' + imgs.map((im, i) =>
      '<button class="pimg" data-pi="' + i + '" style="background-image:url(\'' + esc(shopImg(im.url, 400)) + '\')"><i>✓</i></button>').join('') + '</div>' +
      '<div class="row wrap" style="gap:6px;margin-top:10px" id="pImgAct"><button class="btn sm" data-pimg="all">تحديد الكل</button><button class="btn sm" data-pimg="content">🎬 لكارت محتوى</button><button class="btn sm" data-pimg="task">☑ لمهمة</button><button class="btn sm" data-pimg="chat">💬 للشات</button><button class="btn sm" data-pimg="copy">🔗 نسخ الروابط</button><button class="btn sm" data-pimg="open">⬇ فتح الأصل</button></div>'
      : '<div class="muted small">المنتج ده مفيهوش صور على Shopify</div>') +
    ((p.variants || []).length > 1 || ((p.variants || [])[0] || {}).sku ? '<div class="sectitle">المقاسات / الألوان</div><div class="list">' + p.variants.map(x => '<div class="lrow"><span class="grow" dir="auto"><b>' + esc(x.title) + '</b>' + (x.sku ? ' <span class="muted small" dir="ltr">' + esc(x.sku) + '</span>' : '') + '</span><span class="muted small">' + esc(egp(x.price)) + (x.inventory != null ? ' · ' + x.inventory + ' قطعة' : '') + '</span></div>').join('') + '</div>' : '') +
    '<div class="sectitle">🎬 المحتوى عن المنتج <span class="muted small">' + cs.length + '</span></div>' +
    (cs.length ? '<div class="list">' + cs.map(i => ccard(i)).join('') + '</div>' : '<div class="muted small">مفيش محتوى لسه</div>') +
    '<div class="sectitle">☑ المهام <span class="muted small">' + ts.length + '</span></div>' +
    (ts.length ? '<div class="list">' + ts.map(t => taskCard(t, { compact: true })).join('') + '</div>' : '<div class="muted small">مفيش مهام لسه</div>') +
    '</div><div class="sf"><button class="btn pri" id="pNewC">+ محتوى للمنتج ده</button>' + (isAdmin() ? '<button class="btn" id="pNewT">+ مهمة للمنتج ده</button>' : '') + '</div>', { wide: true });
  $('#x').onclick = closeSheet;
  const sel = new Set();
  const pick = () => [...sel].sort((a, b) => a - b).map(i => prodImageFile(p, imgs[i], i));
  $$('[data-pi]', root).forEach(b => b.onclick = () => { const i = +b.dataset.pi; sel.has(i) ? sel.delete(i) : sel.add(i); b.classList.toggle('on', sel.has(i)); });
  $$('[data-pimg]', root).forEach(b => b.onclick = async () => {
    const a = b.dataset.pimg;
    if (a === 'all') { const on = sel.size !== imgs.length; imgs.forEach((_, i) => on ? sel.add(i) : sel.delete(i)); $$('[data-pi]', root).forEach(x => x.classList.toggle('on', on)); return; }
    const files = pick(); if (!files.length) return toast('اختار صورة واحدة على الأقل');
    if (a === 'copy') { const t = files.map(f => f.url).join('\n'); navigator.clipboard ? navigator.clipboard.writeText(t).then(() => toast('اتنسخ ' + files.length + ' رابط')) : prompt('الروابط', t); }
    else if (a === 'open') files.forEach(f => window.open(f.url, '_blank', 'noopener'));
    else if (a === 'chat') { S._chatDraft = (S._chatDraft ? S._chatDraft + '\n' : '') + p.title + '\n' + files.map(f => f.url).join('\n') + ' '; closeSheet(); go('chat'); }
    else if (a === 'content') chooseTarget('content', p, files);
    else if (a === 'task') chooseTarget('task', p, files);
  });
  $('#pNewC').onclick = () => { closeSheet(); newItem({ product_ids: [p.id], title: p.title }); };
  const nt = $('#pNewT'); if (nt) nt.onclick = () => { closeSheet(); newTask({ product_ids: [p.id], title: p.title }); };
  $$('[data-open]', root).forEach(el => el.onclick = () => openItem(el.dataset.open));
}
/* Send chosen product photos to an existing content card / task, or a new one. */
function chooseTarget(kind, p, files) {
  const linked = kind === 'content' ? contentFor(p.id) : tasksFor(p.id);
  const rest = kind === 'content' ? S.items.filter(i => !linked.includes(i) && i.stage !== 'posted') : S.tasks.filter(t => !linked.includes(t) && t.status !== 'Done');
  const opt = x => '<option value="' + x.id + '">' + esc(x.title) + '</option>';
  const ov = stackOverlay('<div class="sh"><b class="grow">' + (kind === 'content' ? 'أضف الصور لكارت محتوى' : 'أضف الصور لمهمة') + '</b><button class="btn ghost sm" data-close>✕</button></div><div class="sb">' +
    '<div class="files" style="margin:10px 0">' + files.map(f => '<span class="file" style="background-image:url(\'' + esc(shopImg(f.url, 200)) + '\')"></span>').join('') + '</div>' +
    '<label class="lb">اختار</label><select class="inp" id="ctSel">' + (linked.length ? '<optgroup label="مرتبط بالمنتج">' + linked.map(opt).join('') + '</optgroup>' : '') + '<optgroup label="الباقي">' + rest.map(opt).join('') + '</optgroup></select>' +
    '</div><div class="sf"><button class="btn pri" id="ctGo">إضافة</button>' + (kind === 'content' || isAdmin() ? '<button class="btn" id="ctNew">+ ' + (kind === 'content' ? 'كارت جديد' : 'مهمة جديدة') + ' بالصور دي</button>' : '') + '</div>');
  $('#ctGo', ov).onclick = async () => {
    const id = $('#ctSel', ov).value; if (!id) return;
    const ok = kind === 'content' ? await addProductImagesToItem(S.items.find(i => i.id === id), p, files) : await addProductImagesToTask(S.tasks.find(t => t.id === id), p, files);
    if (ok) { ov.remove(); kind === 'content' ? openItem(id) : openTask(id); }
  };
  const nw = $('#ctNew', ov); if (nw) nw.onclick = async () => {
    ov.remove(); closeSheet();
    if (kind === 'content') { const it = await createItem({ title: p.title, product_ids: [p.id], product: p.title }, { open: false }); if (it && await addProductImagesToItem(it, p, files)) openItem(it.id); }
    else newTask({ product_ids: [p.id], title: p.title, _images: files });
  };
}
async function addProductImagesToItem(it, p, files, stage) {
  if (!it) return false;
  const tab = stage || it.stage;
  let n = 0;
  for (const f of files) if (await stagePatch(it, { p_stage: tab, p_op: 'add', p_kind: 'files', p_entry: { name: f.name, url: f.url, type: f.type, product_id: f.product_id } })) n++;
  if (p && !(it.product_ids || []).includes(p.id)) await updateItem(it.id, { product_ids: [...(it.product_ids || []), p.id], ...(it.product ? {} : { product: p.title }) }, true);
  if (n) { logAct(it.id, 'files', null, null, n + ' صورة منتج في «' + SM[tab].n + '»'); toast('اتضاف ' + n + ' صورة'); renderAllBg(); }
  return n > 0;
}
async function addProductImagesToTask(t, p, files) {
  if (!t) return false;
  const cur = S.tasks.find(x => x.id === t.id) || t;
  const add = files.map(f => ({ id: uid(), url: f.url, name: f.name, product_id: f.product_id, uploadedBy: S.me.id, uploadedAt: new Date().toISOString(), note: p ? p.title : '' }));
  const patch = { attachments: [...(cur.attachments || []), ...add] };
  if (p && !(cur.product_ids || []).includes(p.id)) patch.product_ids = [...(cur.product_ids || []), p.id];
  const ok = await updateTask(t.id, patch, { silent: true });
  if (ok) toast('اتضاف ' + add.length + ' صورة');
  return ok;
}

/* ───────── PICKERS (open on top of the current sheet) ───────── */
function stackOverlay(html) {
  const ov = document.createElement('div');
  ov.className = 'overlay stack';
  ov.innerHTML = '<div class="sheet">' + html + '</div>';
  ov.onclick = e => { if (e.target === ov || e.target.closest('[data-close]')) ov.remove(); };
  document.body.appendChild(ov);
  return ov;
}
/* Multi-select products. Resolves with the chosen ids, or null if closed. */
function pickProducts(selected, title) {
  return new Promise(res => {
    const sel = new Set(selected || []);
    let done = false;
    const ov = stackOverlay('<div class="sh"><input class="inp" id="ppQ" placeholder="ابحث عن منتج…" autocomplete="off"><button class="btn ghost sm" data-close>✕</button></div>' +
      '<div class="sb"><div class="muted small" style="margin:8px 0">' + esc(title || 'اختار منتج أو أكتر') + '</div><div class="ppick" id="ppList"></div></div>' +
      '<div class="sf"><button class="btn pri" id="ppOk">تم <span id="ppN"></span></button></div>');
    const draw = () => {
      const q = $('#ppQ', ov).value.trim().toLowerCase();
      const list = S.products.filter(p => sel.has(p.id) || ((p.status === 'ACTIVE' || q) && (!q || [p.title, ...(p.collections || []), ...(p.variants || []).map(x => x.sku)].some(x => String(x || '').toLowerCase().includes(q)))))
        .sort((a, b) => (sel.has(b.id) ? 1 : 0) - (sel.has(a.id) ? 1 : 0)).slice(0, 120);
      $('#ppList', ov).innerHTML = list.length ? list.map(p => '<button class="pprow' + (sel.has(p.id) ? ' on' : '') + '" data-pp="' + esc(p.id) + '"><span class="pth" style="background-image:url(\'' + esc(shopImg(p.image, 120) || '') + '\')"></span><span class="grow"><b dir="auto">' + esc(p.title) + '</b><span class="muted small">' + esc(prodPrice(p)) + ((p.collections || [])[0] ? ' · ' + esc(p.collections[0]) : '') + '</span></span><i>✓</i></button>').join('')
        : '<div class="empty">' + (S.products.length ? 'مفيش نتائج' : 'المنتجات لسه بتتحمل من Shopify…') + '</div>';
      $('#ppN', ov).textContent = sel.size ? '(' + sel.size + ')' : '';
      $$('[data-pp]', ov).forEach(b => b.onclick = () => { const id = b.dataset.pp; sel.has(id) ? sel.delete(id) : sel.add(id); b.classList.toggle('on', sel.has(id)); $('#ppN', ov).textContent = sel.size ? '(' + sel.size + ')' : ''; });
    };
    $('#ppQ', ov).oninput = () => debounce('ppq', draw, 150);
    $('#ppOk', ov).onclick = () => { done = true; ov.remove(); res([...sel]); };
    new MutationObserver((_, o) => { if (!ov.isConnected) { o.disconnect(); if (!done) res(null); } }).observe(document.body, { childList: true });
    draw(); setTimeout(() => $('#ppQ', ov).focus(), 60);
  });
}
/* Pick product photos. Starts on the given products (if any) and can browse the whole catalog.
   Resolves with [{ name, url, type, product_id }] or null. */
function pickProductImages(productIds, title) {
  return new Promise(res => {
    const chosen = new Map();     // url -> file
    let cur = (productIds || []).find(id => prod(id)) || null, done = false;
    const ov = stackOverlay('<div class="sh"><b class="grow">' + esc(title || 'صور المنتجات') + '</b><button class="btn ghost sm" data-close>✕</button></div><div class="sb" id="piBody"></div>' +
      '<div class="sf"><button class="btn pri" id="piOk">استخدام الصور <span id="piN"></span></button></div>');
    const count = () => { $('#piN', ov).textContent = chosen.size ? '(' + chosen.size + ')' : ''; };
    const draw = () => {
      const body = $('#piBody', ov), linked = (productIds || []).map(prod).filter(Boolean);
      let h = '<div class="chips" style="margin-top:10px">' + linked.map(p => '<button class="chip' + (cur === p.id ? ' on' : '') + '" data-pic="' + esc(p.id) + '">' + esc(p.title.slice(0, 28)) + '</button>').join('') +
        '<button class="chip' + (!cur ? ' on' : '') + '" data-pic="">🔍 كل المنتجات</button></div>';
      if (cur) {
        const p = prod(cur), imgs = prodImgs(p);
        h += '<div class="row" style="margin:6px 0 8px"><b class="grow" dir="auto">' + esc(p.title) + '</b><button class="btn sm ghost" data-piall>تحديد الكل</button></div>' +
          (imgs.length ? '<div class="pimgs">' + imgs.map((im, i) => '<button class="pimg' + (chosen.has(im.url) ? ' on' : '') + '" data-pimgi="' + i + '" style="background-image:url(\'' + esc(shopImg(im.url, 400)) + '\')"><i>✓</i></button>').join('') + '</div>' : '<div class="muted small">مفيش صور للمنتج ده</div>');
      } else {
        h += '<input class="inp" id="piQ" placeholder="ابحث عن منتج…" value="' + esc(S._piQ || '') + '" style="margin-bottom:8px">';
        const q = (S._piQ || '').trim().toLowerCase();
        const list = S.products.filter(p => p.image && (q ? [p.title, ...(p.collections || [])].some(x => String(x || '').toLowerCase().includes(q)) : p.status === 'ACTIVE')).slice(0, 90);
        h += list.length ? '<div class="pimgs">' + list.map(p => '<button class="pimg prodpick" data-pip="' + esc(p.id) + '" style="background-image:url(\'' + esc(shopImg(p.image, 400)) + '\')"><span>' + esc(p.title.slice(0, 34)) + '</span></button>').join('') + '</div>' : '<div class="empty">' + (S.products.length ? 'مفيش نتائج' : 'المنتجات لسه بتتحمل…') + '</div>';
      }
      body.innerHTML = h; count();
      $$('[data-pic]', body).forEach(b => b.onclick = () => { cur = b.dataset.pic || null; draw(); });
      $$('[data-pip]', body).forEach(b => b.onclick = () => { cur = b.dataset.pip; if (!(productIds || []).includes(cur)) productIds = [...(productIds || []), cur]; draw(); });
      const p = cur && prod(cur), imgs = p ? prodImgs(p) : [];
      $$('[data-pimgi]', body).forEach(b => b.onclick = () => { const im = imgs[+b.dataset.pimgi]; chosen.has(im.url) ? chosen.delete(im.url) : chosen.set(im.url, prodImageFile(p, im, +b.dataset.pimgi)); b.classList.toggle('on', chosen.has(im.url)); count(); });
      const all = $('[data-piall]', body); if (all) all.onclick = () => { const on = imgs.some(im => !chosen.has(im.url)); imgs.forEach((im, i) => on ? chosen.set(im.url, prodImageFile(p, im, i)) : chosen.delete(im.url)); draw(); };
      const q = $('#piQ', body); if (q) q.oninput = () => { S._piQ = q.value; debounce('piq', () => { draw(); const n = $('#piQ', ov); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 200); };
    };
    $('#piOk', ov).onclick = () => { if (!chosen.size) return toast('اختار صورة واحدة على الأقل'); done = true; ov.remove(); res([...chosen.values()]); };
    new MutationObserver((_, o) => { if (!ov.isConnected) { o.disconnect(); if (!done) res(null); } }).observe(document.body, { childList: true });
    draw();
  });
}

/* ───────── BLOCKS used by content and task sheets ───────── */
function productsBlock(ids, key) {
  const ps = (ids || []).map(id => prod(id) || { id, title: 'منتج #' + id, missing: true });
  return '<div class="sectitle">🛍 المنتجات <span class="muted small">' + ps.length + '</span></div>' +
    (ps.length ? '<div class="plinks">' + ps.map(p => '<div class="plink">' +
      '<button class="pth" data-goprod="' + esc(p.id) + '" style="' + (p.image ? 'background-image:url(\'' + esc(shopImg(p.image, 160)) + '\')' : '') + '"></button>' +
      '<button class="grow plt" data-goprod="' + esc(p.id) + '"><b dir="auto">' + esc(p.title) + '</b><span class="muted small">' + (p.missing ? 'مش موجود في الكتالوج' : esc(prodPrice(p)) + (p.inventory != null ? ' · ' + (p.inventory <= 0 ? 'نفد' : 'مخزون ' + p.inventory) : '')) + '</span></button>' +
      '<button class="xbtn" data-unprod="' + key + '|' + esc(p.id) + '" title="فك الربط">✕</button></div>').join('') + '</div>' : '') +
    '<div class="row wrap" style="gap:6px;margin-top:8px"><button class="btn sm" data-linkprod="' + key + '">+ ربط منتج من Shopify</button>' +
    (ps.some(p => prodImgs(p).length) ? '<button class="btn sm" data-useimgs="' + key + '">📸 استخدم صور المنتج</button>' : '') + '</div>';
}
document.addEventListener('click', e => {
  const g = e.target.closest('[data-goprod]');
  if (g && prod(g.dataset.goprod)) { e.preventDefault(); openProduct(g.dataset.goprod); }
});
/* key is "item:<id>" or "task:<id>" */
function bindProductsBlock(root, rerender) {
  const target = key => { const [k, id] = key.split(':'); return k === 'item' ? { k, x: S.items.find(i => i.id === id) } : { k, x: S.tasks.find(t => t.id === id) }; };
  const save = async (k, x, ids) => {
    const patch = { product_ids: ids };
    if (k === 'item' && !x.product && ids.length && prod(ids[0])) patch.product = prod(ids[0]).title;
    return k === 'item' ? updateItem(x.id, patch, true) : updateTask(x.id, patch, { silent: true });
  };
  $$('[data-linkprod]', root).forEach(b => b.onclick = async () => {
    const { k, x } = target(b.dataset.linkprod); if (!x) return;
    const ids = await pickProducts(x.product_ids || [], 'المنتجات اللي ' + (k === 'item' ? 'الكارت' : 'المهمة') + ' دي عنها');
    if (ids === null) return;
    if (await save(k, x, ids)) { toast('تم الربط ✓', 1200); rerender(); renderAllBg(); }
  });
  $$('[data-unprod]', root).forEach(b => b.onclick = async () => {
    const [key, pid] = b.dataset.unprod.split('|'); const { k, x } = target(key); if (!x) return;
    if (await save(k, x, (x.product_ids || []).filter(id => id !== pid))) { rerender(); renderAllBg(); }
  });
  $$('[data-useimgs]', root).forEach(b => b.onclick = async () => {
    const { k, x } = target(b.dataset.useimgs); if (!x) return;
    const files = await pickProductImages(x.product_ids || [], k === 'item' ? 'صور المنتج لمرحلة «' + SM[(root.querySelector('.stab.on') || {}).dataset?.stab || x.stage].n + '»' : 'صور المنتج للمهمة');
    if (!files || !files.length) return;
    const ok = k === 'item' ? await addProductImagesToItem(x, null, files, (root.querySelector('.stab.on') || {}).dataset?.stab) : await addProductImagesToTask(x, null, files);
    if (ok) rerender();
  });
}
/* Product photo as the card thumbnail when the card has no image of its own. */
function productThumb(it) { const p = (it.product_ids || []).map(prod).find(x => x && x.image); return p ? shopImg(p.image, 200) : null; }
/* 🛍 button for any text box: inserts the chosen product photos as links (they show as images). */
async function insertProductImages(ta, productIds) {
  const files = await pickProductImages(productIds || [], 'إرسال صور منتج');
  if (!files || !files.length || !ta) return;
  ta.value = (ta.value ? ta.value.replace(/\s*$/, '') + '\n' : '') + files.map(f => f.url).join('\n') + ' ';
  ta.dispatchEvent(new Event('input')); ta.focus();
}

VIEWS.products = viewProducts;
