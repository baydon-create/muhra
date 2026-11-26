'use strict';
/* Research & operations: Adlumi ads, publishing queue, and the embedded modules
   (Competitor Intel, UGC creators, media compressor) that live inside the hub. */

/* ───────── ADLUMI ADS ───────── */
const AD_STATUS = { new: 'جديد', idea: 'اتحول لفكرة', used: 'اتنفذ', archived: 'أرشيف' };
const AD_PLAT = { facebook: 'Facebook', instagram: 'Instagram', adlibrary: 'Ad Library', youtube: 'YouTube', linkedin: 'LinkedIn', reddit: 'Reddit', x: 'X', google: 'Google' };
async function loadAds() {
  const { data, error } = await sb.from('hq_ads').select('*').order('sent_at', { ascending: false }).limit(500);
  if (!error) S.ads = data || [];
}
const money = n => n == null ? '—' : '$' + (n >= 1000 ? Math.round(n / 100) / 10 + 'K' : Math.round(n));
function adThumb(a) { const u = a.thumb || a.media_url; return u ? 'background-image:url(\'' + esc(u) + '\')' : ''; }
function viewAds(v) {
  if (S.ads === null) { v.innerHTML = '<div class="empty">جاري التحميل…</div>'; loadAds().then(renderAll); return; }
  const f = S.adsFilter;
  let list = S.ads.filter(a => (f.status === 'all' ? true : f.status === 'active' ? a.status !== 'archived' : a.status === f.status) && (!f.platform || a.platform === f.platform) &&
    (!f.q || [a.advertiser, a.headline, a.body, a.landing_domain, (a.tags || []).join(' ')].join(' ').toLowerCase().includes(f.q.toLowerCase())));
  const sorters = { new: (a, b) => String(b.sent_at).localeCompare(String(a.sent_at)), score: (a, b) => (b.winning_score || 0) - (a.winning_score || 0), days: (a, b) => (b.days_running || 0) - (a.days_running || 0), spend: (a, b) => ((b.estimates || {}).spend_mid || 0) - ((a.estimates || {}).spend_mid || 0) };
  list = list.sort(sorters[f.sort] || sorters.new);
  const plats = [...new Set(S.ads.map(a => a.platform).filter(Boolean))];
  v.innerHTML = '<h1 class="ptitle">إعلانات Adlumi</h1><div class="muted small" style="margin:-6px 2px 12px">الإعلانات اللي الفريق بعتها من إضافة Adlumi — بالتقديرات والسكور. حوّل أي إعلان لفكرة محتوى بضغطة.</div>' +
    '<div class="toolbar"><input class="inp" id="adQ" placeholder="ابحث بالمعلن أو الكلام…" value="' + esc(f.q) + '" style="flex:1;min-width:160px">' +
    '<select class="mini" id="adP"><option value="">كل المنصات</option>' + plats.map(p => '<option value="' + esc(p) + '"' + (f.platform === p ? ' selected' : '') + '>' + esc(AD_PLAT[p] || p) + '</option>').join('') + '</select>' +
    '<select class="mini" id="adS"><option value="new"' + (f.sort === 'new' ? ' selected' : '') + '>الأحدث</option><option value="score"' + (f.sort === 'score' ? ' selected' : '') + '>أعلى سكور</option><option value="days"' + (f.sort === 'days' ? ' selected' : '') + '>أطول تشغيل</option><option value="spend"' + (f.sort === 'spend' ? ' selected' : '') + '>أعلى صرف</option></select></div>' +
    '<div class="chips">' + [['active', 'الكل'], ['new', 'جديد'], ['idea', 'اتحول لفكرة'], ['used', 'اتنفذ'], ['archived', 'أرشيف']].map(([k, n]) => '<button class="chip' + (f.status === k ? ' on' : '') + '" data-ast="' + k + '">' + n + ' <span class="c">' + (k === 'active' ? S.ads.filter(a => a.status !== 'archived').length : S.ads.filter(a => a.status === k).length) + '</span></button>').join('') + '</div>' +
    (S.ads.length ? (list.length ? '<div class="rgrid">' + list.map(a => '<div class="card rcard adcard" data-ad="' + a.id + '"><div class="img" style="' + adThumb(a) + '">' + (a.platform ? '<span class="fmt">' + esc(AD_PLAT[a.platform] || a.platform) + '</span>' : '') + (a.winning_score != null ? '<span class="er">' + ic('zap') + ' ' + a.winning_score + '</span>' : '') + '</div>' +
      '<div class="bd"><div class="u">' + esc(a.advertiser || a.landing_domain || 'معلن') + '</div><div class="cap" dir="auto">' + esc(a.headline || a.body || '') + '</div>' +
      '<div class="st">' + (a.days_running ? '<span>' + ic('flame') + ' ' + a.days_running + 'd</span>' : '') + ((a.estimates || {}).spend_mid ? '<span>~' + money(a.estimates.spend_mid) + '</span>' : '') + '<span>' + esc(AD_STATUS[a.status] || '') + '</span></div>' +
      '<div class="row" style="gap:4px">' + av(a.sent_by, false, true) + '<span class="muted small">' + fmtShort(a.sent_at) + '</span></div></div></div>').join('') + '</div>' : '<div class="empty">مفيش إعلانات بالفلتر ده</div>')
      : '<div class="card pad"><b>لسه مفيش إعلانات</b><ol class="small" style="margin:8px 0 0;padding-inline-start:18px;line-height:1.9"><li>افتح داشبورد Adlumi ← الإعدادات ← <b>Muhra HQ</b></li><li>سجل دخول بنفس اسم المستخدم وكلمة المرور بتوع الهب</li><li>اضغط <b>📤 ابعت للفريق</b> على أي إعلان، أو <b>مزامنة المفضلة</b></li></ol><a class="btn sm" style="margin-top:10px" href="' + LINKS.adLibrary + '" target="_blank" rel="noopener">فتح Meta Ad Library</a></div>');
  $('#adQ').oninput = e => { f.q = e.target.value; clearTimeout(S._adq); S._adq = setTimeout(() => { renderAll(); const q = $('#adQ'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 300); };
  $('#adP').onchange = e => { f.platform = e.target.value; renderAll(); };
  $('#adS').onchange = e => { f.sort = e.target.value; renderAll(); };
  $$('[data-ast]', v).forEach(b => b.onclick = () => { f.status = b.dataset.ast; renderAll(); });
  $$('[data-ad]', v).forEach(c => c.onclick = () => openAd(c.dataset.ad));
}
function openAd(id) {
  const a = (S.ads || []).find(x => x.id === id);
  if (!a) { loadAds().then(() => { if ((S.ads || []).find(x => x.id === id)) openAd(id); else toast('الإعلان غير موجود'); }); return; }
  const e = a.estimates || {}, g = a.engagement || {};
  const link = (u, t) => safeUrl(u) ? '<a href="' + esc(safeUrl(u)) + '" target="_blank" rel="noopener">' + esc(t || u) + '</a>' : '';
  const fact = (l, v2) => v2 || v2 === 0 ? '<dt>' + l + '</dt><dd>' + v2 + '</dd>' : '';
  const libQ = LINKS.adLibrary + '?active_status=all&ad_type=all&country=ALL&search_type=keyword_unordered&q=' + encodeURIComponent(a.advertiser || a.landing_domain || '');
  const linked = S.items.find(i => i.ad_id === a.id);
  const root = sheet('<div class="sh"><button class="btn ghost sm" id="x">' + ic('x') + '</button><b class="grow">' + esc(a.advertiser || a.landing_domain || 'إعلان') + '</b>' + (a.winning_score != null ? '<span class="pill">' + ic('zap') + ' ' + a.winning_score + '</span>' : '') + '</div><div class="sb">' +
    ((a.thumb || a.media_url) ? '<img class="adimg" src="' + esc(a.thumb || a.media_url) + '" alt="" referrerpolicy="no-referrer">' : '') +
    (a.headline ? '<h3 dir="auto" style="margin:12px 0 4px">' + esc(a.headline) + '</h3>' : '') + (a.body ? '<div class="desc" dir="auto">' + esc(a.body) + '</div>' : '') +
    '<div class="row wrap" style="margin:10px 0;gap:6px">' + (linked ? '<button class="chip-link" data-open="' + linked.id + '">' + ic('film') + ' ' + esc(linked.title) + '</button>' : '<button class="btn pri sm" id="adIdea">حوّله لفكرة محتوى</button>') +
    (a.post_url ? '<a class="btn sm" href="' + esc(safeUrl(a.post_url)) + '" target="_blank" rel="noopener">فتح الإعلان ↗</a>' : '') + '<a class="btn sm" href="' + esc(libQ) + '" target="_blank" rel="noopener">Ad Library ↗</a></div>' +
    '<div class="sectitle">التقديرات (من Adlumi)</div><dl class="facts">' +
    fact('الصرف التقريبي', e.spend_mid ? money(e.spend_lo) + ' – ' + money(e.spend_hi) + ' (~' + money(e.spend_mid) + ')' : '') + fact('الصرف اليومي', e.daily_mid ? money(e.daily_mid) : '') +
    fact('CPM', e.cpm ? '$' + Number(e.cpm).toFixed(2) : '') + fact('ROAS', e.roas ? Number(e.roas).toFixed(1) + 'x' : '') + fact('الثقة', e.confidence || '') +
    fact('شغال من', a.days_running ? a.days_running + ' يوم' : '') + fact('الحالة', a.active === true ? 'شغال' : a.active === false ? 'متوقف' : '') + fact('اتشاف', a.seen_count ? a.seen_count + ' مرة' : '') +
    fact('تفاعل', ['reactions', 'likes', 'comments', 'shares', 'views'].filter(k => g[k]).map(k => k + ' ' + num(g[k])).join(' · ')) +
    fact('CTA', esc(a.cta || '')) + fact('الصفحة', link(a.landing_url, a.landing_domain || a.landing_url)) + fact('المنصة', esc(AD_PLAT[a.platform] || a.platform || '')) + '</dl>' +
    ((a.angles || []).length ? '<div class="sectitle">الزوايا</div><div class="row wrap">' + a.angles.map(x => '<span class="pill">' + esc(x) + '</span>').join('') + '</div>' : '') +
    ((a.offers || []).length ? '<div class="sectitle">العروض</div><div class="row wrap">' + a.offers.map(x => '<span class="pill">' + esc(x) + '</span>').join('') + '</div>' : '') +
    (a.adlumi_notes ? '<div class="sectitle">ملاحظة اللي بعته</div><div class="desc" dir="auto">' + esc(a.adlumi_notes) + '</div>' : '') +
    '<label class="lb">ملاحظات الفريق</label><textarea class="inp" id="adNotes" dir="auto" placeholder="ليه الإعلان ده مهم؟ الهوك، الزاوية، العرض…">' + esc(a.team_notes || '') + '</textarea>' +
    '<div class="g2"><div><label class="lb">الحالة</label><select class="inp" id="adSt">' + Object.entries(AD_STATUS).map(([k, n]) => '<option value="' + k + '"' + (a.status === k ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>' +
    '<div><label class="lb">تاجز</label><input class="inp" id="adTags" dir="auto" value="' + esc((a.tags || []).join(', ')) + '"></div></div>' +
    '<div class="muted small" style="margin-top:12px">بعته ' + esc(firstName(a.sent_by)) + ' · ' + fmtTime(a.sent_at) + '</div>' +
    (isAdmin() ? '<button class="btn bad sm" id="adDel" style="margin-top:14px">حذف</button>' : '') + '</div>');
  $('#x').onclick = closeSheet;
  $$('[data-open]', root).forEach(b => b.onclick = () => openItem(b.dataset.open));
  const upd = async patch => { Object.assign(a, patch); const { error } = await sb.from('hq_ads').update(patch).eq('id', a.id); if (error) toast('لم يتم الحفظ'); else toast('تم الحفظ', 1000); };
  $('#adNotes').onchange = e2 => upd({ team_notes: e2.target.value.trim() || null });
  $('#adSt').onchange = e2 => upd({ status: e2.target.value }).then(renderAll);
  $('#adTags').onchange = e2 => upd({ tags: e2.target.value.split(',').map(t => t.trim()).filter(Boolean) });
  const ai = $('#adIdea'); if (ai) ai.onclick = async () => {
    const it = await createItem({ title: 'فكرة من إعلان ' + (a.advertiser || a.landing_domain || ''), type: /video|reel/i.test(a.media_type || '') ? 'reel' : 'post', ad_id: a.id,
      ref_url: a.post_url || a.landing_url || null, ref_thumb: a.media_url || null, ref_source: 'Adlumi · ' + (a.advertiser || ''), brief: [a.headline, a.body, a.team_notes && ('ملاحظة: ' + a.team_notes)].filter(Boolean).join('\n\n') }, { open: false });
    if (it) { await upd({ status: 'idea' }); renderAll(); openItem(it.id); }
  };
  const del = $('#adDel'); if (del) del.onclick = async () => { if (!confirm('حذف الإعلان من الهب؟')) return; await sb.from('hq_ads').delete().eq('id', a.id); S.ads = S.ads.filter(x => x.id !== a.id); closeSheet(); renderAll(); };
}

/* ───────── PUBLISHING QUEUE (read-only mirror of the Drive folders) ───────── */
const SLOTS = [['12:00', '13:00', 'صور + ستوري'], ['18:00', '19:00', 'ستوري + ريلز'], ['22:00', '23:00', 'ريلز']];
async function loadPublish() {
  const [{ data }, { data: meta }] = await Promise.all([
    sb.from('hq_publish').select('*').gte('post_date', addDays(today(), -3)).order('post_date').order('position'),
    sb.from('hq_publish_meta').select('*').eq('id', 1).maybeSingle()
  ]);
  S.publish = data || []; S.publishMeta = meta || null;
}
const driveFolder = id => 'https://drive.google.com/drive/folders/' + encodeURIComponent(id);
function pubStatus(p) {
  const total = p.images_total + p.stories_total + p.reels_total;
  const done = (p.images_posted ? p.images_total : 0) + p.stories_posted + p.reels_posted;
  const d = dayDiff(p.post_date);
  if (p.posted || (total && done >= total)) return ['okp', 'اتنشر'];
  if (!total) return ['late', 'فولدر فاضي'];
  if (d < 0) return ['late', done ? 'اتنشر جزئيًا' : 'فات ومتنشرش'];
  if (done) return ['soon', 'بينشر'];
  return ['', d === 0 ? 'النهارده' : 'مستني'];
}
function contentForFolder(p) { return S.items.find(i => i.publish_folder_id === p.folder_id) || contentForProduct(p.product); }
function contentForProduct(name) {
  const n = String(name || '').toLowerCase().trim(); if (!n) return null;
  return S.items.find(i => (i.product && i.product.toLowerCase().trim() === n) || i.title.toLowerCase().includes(n));
}
function publishChips(day) {
  if (!S.publish) return '';
  const ps = S.publish.filter(p => p.post_date === day);
  return ps.length ? '<a class="pill" href="#/publish" title="منتجات في فولدر النشر">' + ic('folder') + ' ' + ps.length + ' في Drive</a>' : '';
}
function viewPublish(v) {
  if (S.publish === null) { v.innerHTML = '<div class="empty">جاري التحميل…</div>'; loadPublish().then(renderAll); return; }
  const meta = S.publishMeta, byDay = {};
  S.publish.forEach(p => (byDay[p.post_date] = byDay[p.post_date] || []).push(p));
  const days = []; for (let i = -3; i <= 14; i++) days.push(addDays(today(), i));
  const counts = c => c.total ? c.done + '/' + c.total : '—';
  const row = p => {
    const [cls, st] = pubStatus(p), c = contentForFolder(p);
    const chip = (lbl, total, done, all) => total ? '<span class="pill ' + (all || done >= total ? 'okp' : done ? 'soon' : '') + '">' + lbl + ' ' + (all ? ic('check') : counts({ total, done })) + '</span>' : '';
    const slot = SLOTS.map(s => s[p.position ? 1 : 0]).join(' · ');
    return '<div class="prow"><div class="grow"><div class="row"><b dir="auto">' + esc(p.product) + '</b><span class="pill ' + cls + '">' + st + '</span></div>' +
      '<div class="meta" style="margin-top:5px">' + chip('صور', p.images_total, p.images_posted ? p.images_total : 0, p.images_posted) + chip('ستوري', p.stories_total, p.stories_posted) + chip('ريلز', p.reels_total, p.reels_posted) +
      (p.has_caption ? '<span class="pill">caption.txt</span>' : '<span class="pill" title="هيتكتب كابشن تلقائي">كابشن تلقائي</span>') + '</div>' +
      '<div class="muted small" style="margin-top:4px">مواعيده: ' + slot + (p.position > 1 ? ' · المنتج التالت وما بعده مش هيتنشر في نفس اليوم' : '') + '</div></div>' +
      '<div class="pact">' + (c ? stageTag(c.stage) + '<button class="btn sm pri" data-pubopen="' + c.id + '" title="افتح كارت المحتوى بتاع المنتج ده في الهب">فتح كارت المحتوى</button>' : '') + '<a class="btn sm" href="' + driveFolder(p.folder_id) + '" target="_blank" rel="noopener">Drive</a></div></div>';
  };
  v.innerHTML = '<h1 class="ptitle">النشر التلقائي</h1>' +
    '<div class="card pad"><div class="row wrap"><div class="grow"><b>إزاي بيشتغل</b><div class="muted small">ارفع المنتج في <b>MUHRA SOCIAL ← فولدر اليوم (يوم-شهر-سنة) ← فولدر باسم المنتج</b> وجواه images / stories / reels. البوت بينشر أول منتجين في اليوم:</div><div class="muted small" style="margin-top:4px">أي منتج في الفولدر بيتعامل إنه <b>معتمد ومستني النشر</b> وكارته بيتنقل لـ «مجدول» لوحده، ولما البوت يكتب <b>[POSTED]</b> الكارت بيتنقل لـ «منشور». لو مفيش كارت، بيتعمل كارت جديد.</div></div>' +
    (meta && meta.root_folder_id ? '<a class="btn sm pri" href="' + driveFolder(meta.root_folder_id) + '" target="_blank" rel="noopener">فتح فولدر النشر</a>' : '') + '</div>' +
    '<div class="slots">' + SLOTS.map(s => '<div class="slot"><b>' + s[0] + ' / ' + s[1] + '</b><span>' + s[2] + '</span></div>').join('') + '</div>' +
    '<div class="muted small">بتوقيت القاهرة · المنتج الأول في المواعيد الأولى والتاني بعدها بساعة · آخر تحديث: ' + (meta && meta.synced_at ? fmtTime(meta.synced_at) : 'لسه') + ' (كل 20 دقيقة)</div></div>' +
    days.map(d => {
      const ps = byDay[d] || [], dd = dayDiff(d), gap = !ps.length && dd >= 0;
      return '<div class="card calday' + (gap ? ' gap' : '') + '"><div class="hd"><b>' + fmtDay(d) + '</b>' + (dd === 0 ? '<span class="pill okp">النهارده</span>' : '') + '<span class="grow"></span>' +
        (gap ? '<span class="small" style="color:var(--bad);font-weight:700">مفيش منتجات للنشر</span>' : '<span class="muted small">' + ps.length + ' منتج</span>') + '</div>' +
        (ps.length ? '<div class="bd">' + ps.map(row).join('') + '</div>' : '') + '</div>';
    }).join('');
  $$('[data-pubopen]', v).forEach(b => b.onclick = () => openItem(b.dataset.pubopen));
}

/* ───────── EMBEDDED MODULES ───────── */
const FRAMES = {
  intel: { src: 'intel/index.html?embed=1&v=3', title: 'Competitor Intel', view: 'overview' },
  ugc: { src: 'intel/index.html?embed=1&v=3', title: 'UGC Creators', view: 'ugcDiscover', shared: 'intel' },
  tools: { src: 'tools/compressor/index.html?embed=1', title: 'Media Compressor' }
};
function frameKey(route) { return (FRAMES[route] && FRAMES[route].shared) || route; }
function showFrame(route, arg) {
  const host = $('#frames'); if (!host) return;
  $('#view').classList.add('hidden'); host.classList.remove('hidden');
  const key = frameKey(route), cfg = FRAMES[route];
  let fr = host.querySelector('iframe[data-k="' + key + '"]');
  const view = arg || (route === 'ugc' ? (S._ugcView || 'ugcDiscover') : (S._intelView || 'overview'));
  if (!fr) {
    fr = document.createElement('iframe');
    fr.dataset.k = key; fr.title = cfg.title; fr.setAttribute('allow', 'clipboard-write');
    fr.src = FRAMES[key === 'intel' ? 'intel' : route].src + (key === 'intel' ? '#view=' + encodeURIComponent(view) : '');
    host.appendChild(fr);
  } else if (key === 'intel') {
    postToFrame(fr, { type: 'hq:go', view });
  }
  host.querySelectorAll('iframe').forEach(f => f.classList.toggle('hidden', f !== fr));
  renderFrameNav();
}
/* Arabic sub-navigation for Competitor Intel / UGC (the module's own menus are hidden inside the hub) */
const INTEL_TABS = [['overview', 'نظرة عامة'], ['gaps', 'الفجوات'], ['report', 'تقرير AI'], ['manage', 'إدارة الحسابات', 1]];
const UGC_TABS = [['ugcDiscover', 'اكتشاف'], ['ugc', 'الكريتورز'], ['ugcPipe', 'المتابعة'], ['ugcInbox', 'الطلبات'], ['ugcAdd', 'إضافة باليوزر', 1], ['ugcSettings', 'الإعدادات', 1]];
function renderFrameNav() {
  const host = $('#frames'); if (!host) return;
  let bar = host.querySelector('.fsub');
  if (!['intel', 'ugc'].includes(S.route)) { if (bar) bar.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.className = 'fsub'; host.prepend(bar); }
  const m = S.intelMeta || {}, admin = m.role === 'admin';
  const ugc = S.route === 'ugc', tabs = (ugc ? UGC_TABS : INTEL_TABS).filter(t => !t[2] || admin);
  const cur = m.view === 'creator' || m.view === 'ugcCompare' ? 'ugc' : m.view;
  const list = ugc ? (m.creators || []) : (m.comps || []);
  const selView = ugc ? 'creator' : 'comp';
  bar.innerHTML = '<div class="fsub-tabs">' + tabs.map(([k, n]) => '<button class="chip' + (cur === k ? ' on' : '') + '" data-fgo="' + k + '">' + n + (k === 'ugcInbox' && m.newApps ? ' <span class="c">' + m.newApps + '</span>' : '') + '</button>').join('') + '</div>' +
    (list.length ? '<select class="mini fsub-sel" id="fsubSel"><option value="">' + (ugc ? 'افتح كريتور…' : 'افتح حساب…') + '</option>' +
      list.map(c => '<option value="' + esc(String(c.id)) + '"' + (m.view === selView && String(m.selected) === String(c.id) ? ' selected' : '') + '>@' + esc(c.u) + (c.own ? ' (Muhra)' : '') + '</option>').join('') + '</select>' : '');
  const fr = host.querySelector('iframe[data-k="intel"]');
  bar.querySelectorAll('[data-fgo]').forEach(b => b.onclick = () => { if (fr) postToFrame(fr, { type: 'hq:go', view: b.dataset.fgo }); });
  const sel = $('#fsubSel'); if (sel) sel.onchange = () => { if (sel.value && fr) postToFrame(fr, { type: 'hq:go', view: selView, id: sel.value }); };
}
function hideFrames() { const host = $('#frames'); if (host) { host.classList.add('hidden'); const b = host.querySelector('.fsub'); if (b) b.remove(); } }
function postToFrame(fr, msg) { try { fr.contentWindow.postMessage(msg, location.origin); } catch {} }
function onModuleMessage(e) {
  if (e.origin !== location.origin || !e.data || typeof e.data.type !== 'string' || !S.me) return;
  const frames = [...document.querySelectorAll('#frames iframe')];
  if (!frames.some(f => f.contentWindow === e.source)) return;
  const m = e.data;
  if (m.type === 'hq:view') {
    // keep the hub menu in sync with where the user is inside Competitor Intel / UGC
    const isUgc = /^ugc|^creator/.test(m.view || '');
    if (isUgc) S._ugcView = m.view; else S._intelView = m.view;
    const want = isUgc ? 'ugc' : 'intel';
    if (S.route !== want && (S.route === 'intel' || S.route === 'ugc')) { history.replaceState(null, '', '#/' + want); S.route = want; renderNav(); }
  } else if (m.type === 'hq:meta') {
    S.intelMeta = m;
    const isUgc = /^ugc|^creator/.test(m.view || '');
    if (isUgc) S._ugcView = m.view; else S._intelView = m.view;
    renderFrameNav();
  } else if (m.type === 'hq:idea') {
    createItem({ title: String(m.title || 'فكرة جديدة').slice(0, 120), type: m.format === 'Reel' ? 'reel' : m.format === 'Carousel' ? 'carousel' : 'post',
      ref_url: safeUrl(m.ref_url) || null, ref_thumb: safeUrl(m.ref_thumb) || null, ref_source: String(m.ref_source || '').slice(0, 80) || null, brief: m.brief ? String(m.brief).slice(0, 2000) : null }, { open: false })
      .then(it => { if (it) toastAction('اتحفظت في «فكرة»', 'افتح', () => openItem(it.id)); });
  } else if (m.type === 'hq:attach' && Array.isArray(m.files)) {
    attachFilesFlow(m.files.filter(f => f instanceof Blob));
  } else if (m.type === 'hq:toast') {
    toast(String(m.text || '').slice(0, 120));
  } else if (m.type === 'hq:nav' && RM[m.route]) {
    go(m.route);
  }
}
function toastAction(msg, label, fn) {
  const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = esc(msg) + ' <button class="tbtn">' + esc(label) + '</button>';
  t.querySelector('button').onclick = () => { t.remove(); fn(); };
  document.body.appendChild(t); setTimeout(() => t.remove(), 5000);
}
/* Files coming from the compressor: attach them to a content card (or a new one) */
function attachFilesFlow(files) {
  if (!files.length) return;
  const open = S.items.filter(i => i.stage !== 'posted').slice(0, 60);
  const size = files.reduce((a, f) => a + (f.size || 0), 0);
  const root = sheet('<div class="sh"><b class="grow">إرفاق ' + files.length + ' ملف (' + (size / 1048576).toFixed(1) + 'MB)</b><button class="btn ghost sm" id="x">' + ic('x') + '</button></div><div class="sb">' +
    '<label class="lb">على أي كارت محتوى؟</label><select class="inp" id="atC"><option value="__new">+ كارت محتوى جديد</option>' + open.map(i => '<option value="' + i.id + '">' + esc(SM[i.stage].n + ' · ' + i.title) + '</option>').join('') + '</select>' +
    '<div class="muted small" style="margin-top:8px">' + files.map(f => esc(f.name || 'file')).join('، ') + '</div>' +
    (files.some(f => f.size > 50 * 1048576) ? '<div class="alert warn">فيه ملف أكبر من 50MB — مش هيترفع. استخدم رابط Drive للملفات الكبيرة.</div>' : '') +
    '</div><div class="sf"><button class="btn pri" id="atGo">إرفاق</button></div>');
  $('#x').onclick = closeSheet;
  $('#atGo').onclick = async () => {
    $('#atGo').disabled = true; $('#atGo').textContent = 'جاري الرفع…';
    let it = $('#atC').value === '__new' ? await createItem({ title: (files[0].name || 'محتوى جديد').replace(/\.[^.]+$/, '') }, { open: false }) : S.items.find(i => i.id === $('#atC').value);
    if (!it) return closeSheet();
    const out = [...(it.files || [])];
    for (const f of files) {
      if (f.size > 50 * 1048576) continue;
      try { const u = await uploadFile(f instanceof File ? f : new File([f], f.name || 'file', { type: f.type }), 'hq/' + it.id); out.push({ name: u.name, url: u.url, by: S.me.id, at: new Date().toISOString() }); } catch { toast('فشل رفع ' + (f.name || '')); }
    }
    await updateItem(it.id, { files: out }, true); logAct(it.id, 'files', null, null, files.length + ' ملف');
    closeSheet(); toast('تم الإرفاق'); openItem(it.id);
  };
}

VIEWS.ads = viewAds; VIEWS.publish = viewPublish;
