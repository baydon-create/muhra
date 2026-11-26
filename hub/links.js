'use strict';
/* Rich previews for reference links (Instagram, TikTok, YouTube, any page): thumbnail, account,
   views, likes, comments. Fetched by the link-preview edge function and cached in hq_link_previews. */

S.previews = {};             // normalized url -> preview row
const _prevAsked = {};       // normalized url -> true once requested this session

/* Same normalization as the edge function, so a link maps to one cached row. */
function normLink(raw) {
  let u; try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
  if (host.endsWith('instagram.com')) {
    const m = u.pathname.match(/\/(?:[^/]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    return m ? 'https://www.instagram.com/' + (m[1] === 'p' ? 'p' : 'reel') + '/' + m[2] + '/' : 'https://www.instagram.com' + u.pathname.replace(/\/+$/, '') + '/';
  }
  if (host.endsWith('tiktok.com')) return 'https://' + u.hostname.toLowerCase() + u.pathname.replace(/\/+$/, '');
  if (host === 'youtu.be' || host.endsWith('youtube.com')) {
    const id = host === 'youtu.be' ? u.pathname.slice(1) : (u.searchParams.get('v') || (u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]+)/) || [])[1]);
    return id ? 'https://www.youtube.com/watch?v=' + id : u.href;
  }
  u.hash = ''; return u.href;
}
const isSocialLink = u => /(instagram\.com|tiktok\.com|youtube\.com|youtu\.be)/i.test(u || '');
const PLAT_IC = { instagram: 'camera', tiktok: 'music', youtube: 'play', web: 'link' };
const PLAT_N = { instagram: 'إنستجرام', tiktok: 'تيك توك', youtube: 'يوتيوب', web: 'رابط' };

/* Returns the cached preview (or undefined) and fetches it in the background the first time. */
function previewFor(url, opts = {}) {
  const k = normLink(url); if (!k) return null;
  if (!_prevAsked[k] || opts.refresh) { _prevAsked[k] = true; loadPreview(url, k, opts.refresh); }
  return S.previews[k];
}
async function loadPreview(url, k, refresh) {
  if (!refresh) {
    const { data } = await sb.from('hq_link_previews').select('*').eq('url', k).maybeSingle();
    const fresh = data && Date.now() - new Date(data.fetched_at).getTime() < 24 * 3600e3;
    if (data) { gotPreview(data); if (fresh && data.status !== 'failed') return; }
  }
  S.previews[k] = Object.assign({}, S.previews[k] || {}, { _loading: true }); refreshPreviews();
  try {
    const { data, error } = await sb.functions.invoke('link-preview', { body: { url, refresh: !!refresh } });
    if (error || !data || data.error) throw new Error((data && data.error) || (error && error.message) || 'failed');
    if (data.url !== k) { S.previews[k] = data; applyPreviewToItems(Object.assign({}, data, { url: k })); }   // server resolved the link to another address: keep both
    gotPreview(data);
  } catch (e) {
    console.warn('preview', e);
    S.previews[k] = Object.assign({}, S.previews[k] || {}, { _loading: false, status: (S.previews[k] || {}).thumb ? (S.previews[k].status || 'partial') : 'failed' });
    refreshPreviews();
  }
}
function gotPreview(row) {
  if (!row || !row.url) return;
  S.previews[row.url] = row;
  applyPreviewToItems(row);
  refreshPreviews();
}
/* Content cards whose reference is this link get its picture and account (board thumbnails, titles). */
function applyPreviewToItems(row) {
  if (row.status === 'failed' || !row.thumb) return;
  S.items.forEach(it => {
    if (!it.ref_url || normLink(it.ref_url) !== row.url) return;
    const patch = {};
    if (it.ref_thumb !== row.thumb && (!it.ref_thumb || /cdninstagram|fbcdn|tiktokcdn/.test(it.ref_thumb))) patch.ref_thumb = row.thumb;
    if (row.account && (!it.ref_source || /\./.test(it.ref_source) && !/^@/.test(it.ref_source))) patch.ref_source = row.account;
    const host = (() => { try { return new URL(it.ref_url).hostname.replace('www.', ''); } catch { return ''; } })();
    if (row.account && host && it.title === 'فكرة من ' + host) patch.title = 'فكرة من ' + row.account + (row.format === 'Reel' ? ' (ريل)' : '');
    if (Object.keys(patch).length) updateItem(it.id, patch, true);
  });
}
function refreshPreviews() {
  debounce('prev', () => {
    if (S.openId && typeof refreshSheetLive === 'function') refreshSheetLive();
    else if (S.route === 'content' || S.route === 'home' || S.route === 'ideas') renderAll();
  }, 250);
}

/* The rich card. opts.compact for stage link lists. */
function linkCard(url, opts = {}) {
  const u = safeUrl(url); if (!u) return '';
  const p = previewFor(u) || {};
  const plat = p.platform || (/instagram/.test(u) ? 'instagram' : /tiktok/.test(u) ? 'tiktok' : /youtu/.test(u) ? 'youtube' : 'web');
  const loading = p._loading || (!p.url && !p.status);
  const stat = (ic, v, t) => v != null ? '<span title="' + t + '">' + ic + ' <b>' + num(v) + '</b></span>' : '';
  const stats = [stat(ic('play'), p.views, 'مشاهدات'), stat(ic('heart'), p.likes, 'لايكات'), stat(ic('msg'), p.comments, 'تعليقات'), stat('↗', p.shares, 'مشاركات')].join('');
  return '<a class="lcard' + (opts.compact ? ' compact' : '') + '" href="' + esc(u) + '" target="_blank" rel="noopener">' +
    '<span class="lthumb" style="' + (p.thumb ? 'background-image:url(\'' + esc(p.thumb) + '\')' : '') + '">' + (p.thumb ? '' : (loading ? '<i class="spin"></i>' : ic(PLAT_IC[plat], 20))) + (p.format ? '<em>' + esc(p.format) + '</em>' : '') + '</span>' +
    '<span class="lbody"><span class="lacc"><b dir="ltr">' + esc(p.account || (loading ? 'جاري جلب المعاينة…' : PLAT_N[plat])) + '</b><span class="muted small">' + ic(PLAT_IC[plat], 14) + ' ' + PLAT_N[plat] + (p.posted_at ? ' · ' + fmtShort(p.posted_at) : '') + '</span></span>' +
    (stats ? '<span class="lstats">' + stats + '</span>' : (p.status === 'partial' && !loading ? '<span class="muted small">الأرقام مش متاحة للرابط ده</span>' : '')) +
    (p.title ? '<span class="lcap" dir="auto">' + esc(String(p.title).slice(0, 140)) + '</span>' : '') +
    (p.status === 'failed' && !loading ? '<span class="muted small">مقدرناش نجيب المعاينة (حساب خاص أو رابط غلط) · <button class="linkbtn" data-reprev="' + esc(u) + '">حاول تاني</button></span>' : '') +
    '</span></a>';
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-reprev]'); if (!b) return;
  e.preventDefault(); e.stopPropagation(); previewFor(b.dataset.reprev, { refresh: true });
});

/* Live updates from other team members' fetches. */
(function watchPreviews() {
  const t = setInterval(() => {
    if (!S.me || !window.sb) return;
    clearInterval(t);
    sb.channel('hub-previews').on('postgres_changes', { event: '*', schema: 'public', table: 'hq_link_previews' }, p => { if (p.new && p.new.url && (S.previews[p.new.url] || _prevAsked[p.new.url])) gotPreview(p.new); }).subscribe();
  }, 1000);
})();
