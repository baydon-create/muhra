'use strict';
/* Muhra HQ — one hub for content, tasks, briefs, chat, research, ads, publishing and tools.
   Shared by every module: config, state, helpers, data, login, shell, router, realtime. */

/* ───────── CONFIG ───────── */
const SB_URL = 'https://ltwzmjqrlvqbndmipufm.supabase.co';
// Supabase publishable key: opens nothing on its own. Every table requires a signed-in team member (row level security).
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0d3ptanFybHZxYm5kbWlwdWZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMDA3NTEsImV4cCI6MjA5MjY3Njc1MX0.pvp5NFr2tOTw_MJHIxHO9kK7cQ75QjL5N8AcewXIVOM';
const BUCKET = 'task-attachments';
const UID_KEY = 'muhra_uid_v3';
const AUTH_KEY = 'muhra-team-auth';                 // one login session for the hub and every embedded module
const LOGIN_DOMAIN = 'team.muhrastore.com';
const LINKS = {
  drive: 'https://drive.google.com/drive/my-drive',
  productBot: 'https://t.me/Muhra_new_products_bot',
  instagram: 'https://www.instagram.com/muhra.egy/',
  business: 'https://business.facebook.com/latest/content_calendar',
  adLibrary: 'https://www.facebook.com/ads/library/'
};
const sb = supabase.createClient(SB_URL, SB_KEY, { auth: { storageKey: AUTH_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });

const STAGES = [
  { k: 'idea', n: 'فكرة', ic: '' },
  { k: 'script', n: 'سكريبت', ic: '' },
  { k: 'shoot', n: 'تصوير', ic: '' },
  { k: 'edit', n: 'مونتاج', ic: '' },
  { k: 'review', n: 'مراجعة', ic: '' },
  { k: 'approved', n: 'معتمد', ic: '' },
  { k: 'scheduled', n: 'مجدول', ic: '' },
  { k: 'posted', n: 'منشور', ic: '' }
];
const SI = Object.fromEntries(STAGES.map((s, i) => [s.k, i]));
const SM = Object.fromEntries(STAGES.map(s => [s.k, s]));
const TYPES = { reel: 'ريل', carousel: 'كاروسيل', post: 'بوست', story: 'ستوري', tiktok: 'تيك توك', ad: 'إعلان' };
const TYPE_IC = { reel: 'film', carousel: 'image', post: 'camera', story: 'story', tiktok: 'music', ad: 'ads' };
const typeIc = (t, s = 16) => ic(TYPE_IC[t] || 'file', s);
const PLATFORMS = { instagram: 'إنستجرام', tiktok: 'تيك توك', facebook: 'فيسبوك' };
const PILLARS = ['إطلاق منتج', 'تنسيقات', 'كواليس', 'آراء عملاء / UGC', 'عروض', 'تعليمي / مقاسات', 'براند'];
const DONE_STAGES = ['approved', 'scheduled', 'posted'];
const AR_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/* Every screen of the hub. group decides where it sits in the menu. */
const ROUTES = [
  { k: 'home', n: 'اليوم', ic: 'home', g: 'work' },
  { k: 'content', n: 'المحتوى', ic: 'board', g: 'work' },
  { k: 'calendar', n: 'التقويم', ic: 'cal', g: 'work' },
  { k: 'products', n: 'المنتجات', ic: 'bag', g: 'work' },
  { k: 'tasks', n: 'المهام', ic: 'tasks', g: 'work' },
  { k: 'briefs', n: 'البريفات', ic: 'crown', g: 'work' },
  { k: 'chat', n: 'الشات', ic: 'chat', g: 'work' },
  { k: 'intel', n: 'المنافسين', ic: 'intel', g: 'research' },
  { k: 'ugc', n: 'الكريتورز UGC', ic: 'ugc', g: 'research' },
  { k: 'ads', n: 'إعلانات Adlumi', ic: 'ads', g: 'research' },
  { k: 'ideas', n: 'أفكار سريعة', ic: 'research', g: 'research' },
  { k: 'publish', n: 'النشر', ic: 'publish', g: 'ops' },
  { k: 'tools', n: 'ضغط الملفات', ic: 'tools', g: 'ops' },
  { k: 'stats', n: 'الأداء', ic: 'stats', g: 'ops' },
  { k: 'team', n: 'الفريق', ic: 'team', g: 'ops' }
];
const RM = Object.fromEntries(ROUTES.map(r => [r.k, r]));
const GROUPS = { work: 'الشغل', research: 'الأبحاث', ops: 'التشغيل' };
const MOBILE_TABS = ['home', 'content', 'tasks', 'chat'];

/* ───────── STATE ───────── */
const S = {
  me: null, team: [], teamMap: {}, photos: {},
  route: 'home', routeArg: null,
  items: [], board: { stage: 'idea', mine: false, type: '' },
  calStart: null, research: { days: 14, format: '', kind: 'competitor', rows: null, loading: false },
  openId: null, stats: null, activity: [],
  tasks: [], taskFilter: { status: 'All', member: 'All', mine: false }, openTaskId: null,
  briefs: [], briefCmts: {}, chat: [], chatSeen: lsGet('hq.chatSeen', 0),
  ads: null, adsFilter: { q: '', platform: '', status: 'active', sort: 'new' },
  publish: null, publishMeta: null,
  loaded: {}
};
function lsGet(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } }

/* ───────── HELPERS ───────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lsG = (k, fb) => lsGet(k, fb);
const lsS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const pad = n => String(n).padStart(2, '0');
const isoDate = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => isoDate(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDate(d); };
const dayDiff = iso => Math.round((new Date(String(iso).slice(0, 10) + 'T12:00:00') - new Date(today() + 'T12:00:00')) / 864e5);
const fmtDay = iso => { const d = new Date(iso + 'T12:00:00'); return AR_DAYS[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1); };
const fmtShort = iso => { const d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); return d.getDate() + '/' + (d.getMonth() + 1); };
const fmtTime = ts => { const d = new Date(ts); return d.getDate() + '/' + (d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const fmtClock = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const fmtSec = s => Math.floor((s || 0) / 60) + ':' + pad((s || 0) % 60);
const num = n => n == null ? '—' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);
const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const isImgUrl = u => /\.(jpe?g|png|gif|webp|bmp)(\?.*)?$/i.test(u || '');
const isApprover = () => !!(S.me && S.me.can_approve);
const approverIds = () => S.team.filter(m => m.can_approve).map(m => m.id);
const approverNames = () => S.team.filter(m => m.can_approve).map(m => firstName(m.id)).join(' أو ') || 'المسؤول';
const isAdmin = () => !!(S.me && S.me.role === 'admin');
const adminIds = () => S.team.filter(m => m.role === 'admin').map(m => m.id);
const nameOf = id => (S.teamMap[id] && S.teamMap[id].name) || (id === 'deleted_member' ? 'عضو محذوف' : id === 'n8n' ? 'بوت النشر' : id) || '—';
const firstName = id => nameOf(id).replace(/^Dr\.\s*/, '').split(' ')[0];
const weekStart = iso => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 1) % 7)); return isoDate(d); }; // weeks start Saturday
function toast(msg, ms = 2200) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms); }
function av(id, lg, sm) {
  const m = S.teamMap[id], cls = 'av' + (lg ? ' lg' : '') + (sm ? ' sm' : '');
  if (!m) return '<span class="' + cls + '" style="background:#B9AEA4" title="' + esc(nameOf(id)) + '">?</span>';
  const ph = S.photos[id];
  return '<span class="' + cls + '" title="' + esc(m.name) + '" style="background-color:' + esc(m.color || '#5C3D2E') + (ph ? ';background-image:url(\'' + esc(ph) + '\')' : '') + '">' + (ph ? '' : esc(m.initials || m.name[0])) + '</span>';
}
/* Text with links and inline images (comments, chat, briefs). @mentions are highlighted. */
function richText(text) {
  if (!text) return '';
  return String(text).split(/(https?:\/\/[^\s]+|@[\p{L}\w]+)/u).map(part => {
    if (/^https?:\/\//.test(part)) {
      const u = safeUrl(part); if (!u) return esc(part);
      return isImgUrl(u) ? '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img class="inl" src="' + esc(u) + '" alt="" loading="lazy"></a>' : '<a href="' + esc(u) + '" target="_blank" rel="noopener" dir="ltr">' + esc(u.length > 60 ? u.slice(0, 57) + '…' : u) + '</a>';
    }
    if (/^@/.test(part)) return '<b class="mention">' + esc(part) + '</b>';
    return esc(part);
  }).join('');
}
function mentionsIn(text) {
  const out = [];
  S.team.forEach(m => { const f = firstName(m.id); if (text.includes('@' + f) || text.includes('@' + m.name) || text.toLowerCase().includes('@' + m.id)) out.push(m.id); });
  return out;
}
/* Signature: a seam of 8 stitches, filled up to the card's stage (idea → posted). */
function stageTag(k) { const s = SM[k] || STAGES[0], i = SI[s.k]; return '<span class="stage-tag" title="' + s.n + ' · ' + (i + 1) + '/' + STAGES.length + '"><span class="seam">' + STAGES.map((_, j) => '<i' + (j <= i ? ' class="on"' : '') + '></i>').join('') + '</span>' + s.n + '</span>'; }
function dueInfo(it) {
  if (DONE_STAGES.includes(it.stage)) return '';
  const out = [];
  if (it.due_date) { const d = dayDiff(it.due_date); out.push('<span class="pill ' + (d < 0 ? 'late' : d <= 1 ? 'soon' : '') + '">' + ic('clock') + ' ' + (d < 0 ? 'متأخر ' + (-d) + ' يوم' : d === 0 ? 'اليوم' : d === 1 ? 'بكرة' : fmtShort(it.due_date)) + '</span>'); }
  if (it.publish_date) { const d = dayDiff(it.publish_date); if (d <= 2) out.push('<span class="pill ' + (d < 0 ? 'late' : 'soon') + '">نشر ' + (d < 0 ? 'فات' : d === 0 ? 'اليوم' : d === 1 ? 'بكرة' : fmtShort(it.publish_date)) + '</span>'); }
  return out.join('');
}
const isLate = it => !DONE_STAGES.includes(it.stage) && ((it.due_date && dayDiff(it.due_date) < 0) || (it.publish_date && dayDiff(it.publish_date) < 0));
function itemThumb(it) {
  const img = (it.files || []).find(f => /\.(jpe?g|png|webp|gif|heic)$/i.test(f.name || f.url || ''));
  const u = (img && img.url) || it.ref_thumb || (typeof productThumb === 'function' && productThumb(it));
  return u ? '<div class="thumb" style="background-image:url(\'' + esc(u) + '\')"></div>' : '<div class="thumb">' + typeIc(it.type, 20) + '</div>';
}
function ccard(it, opts = {}) {
  return '<div class="card ccard" data-open="' + it.id + '">' + itemThumb(it) +
    '<div class="grow"><div class="t">' + esc(it.title) + '</div><div class="meta">' +
    (opts.noStage ? '' : stageTag(it.stage)) +
    '<span class="pill">' + typeIc(it.type) + ' ' + (TYPES[it.type] || it.type) + '</span>' + dueInfo(it) +
    (it.changes_note && it.stage === 'edit' ? '<span class="pill late">تعديلات</span>' : '') +
    '</div>' + (opts.extra || '') + '</div>' + (it.owner ? av(it.owner) : '') + '</div>';
}
function sheet(html, opts = {}) {
  const root = $('#sheetRoot');
  root.innerHTML = '<div class="overlay" id="ov"><div class="sheet' + (opts.wide ? ' wide' : '') + '">' + html + '</div></div>';
  $('#ov').onclick = e => { if (e.target.id === 'ov') (opts.onClose || closeSheet)(); };
  return root;
}
function closeSheet() { S.openId = null; S.openTaskId = null; $('#sheetRoot').innerHTML = ''; if (/^#(item|task)=/.test(location.hash)) history.replaceState(null, '', '#/' + S.route); }
async function uploadFile(file, folder) {
  const clean = (file.name || 'file').replace(/[^\w.\-]+/g, '_').slice(-60);
  const path = folder + '/' + Date.now().toString(36) + '_' + clean;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw error;
  return { url: sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, path, name: file.name || clean, type: file.type || '' };
}
function pickFiles(accept, multiple) {
  return new Promise(res => {
    const fp = $('#filePick'); fp.value = ''; fp.accept = accept || '*/*'; fp.multiple = !!multiple;
    fp.onchange = () => res([...fp.files]); fp.click();
  });
}
/* Voice notes: one recorder at a time, returns an uploaded file record */
const Rec = { mr: null, chunks: [], t0: 0, timer: null };
async function recStart(onTick) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const type = window.MediaRecorder && MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
  Rec.chunks = []; Rec.mr = new MediaRecorder(stream, { mimeType: type }); Rec.t0 = Date.now();
  Rec.mr.ondataavailable = e => { if (e.data.size) Rec.chunks.push(e.data); };
  Rec.mr.start();
  Rec.timer = setInterval(() => onTick && onTick(Math.round((Date.now() - Rec.t0) / 1000)), 500);
}
function recStop(folder) {
  return new Promise((res, rej) => {
    if (!Rec.mr) return res(null);
    const mr = Rec.mr; clearInterval(Rec.timer);
    mr.onstop = async () => {
      mr.stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(Rec.chunks, { type: mr.mimeType }), dur = Math.round((Date.now() - Rec.t0) / 1000);
      Rec.mr = null;
      try { const f = await uploadFile(new File([blob], 'voice-' + Date.now() + (mr.mimeType.includes('webm') ? '.webm' : '.mp4'), { type: mr.mimeType }), folder); f.duration = dur; res(f); }
      catch (e) { rej(e); }
    };
    mr.stop();
  });
}

/* ───────── DATA ───────── */
async function loadTeam() {
  const [{ data: t, error }, { data: p }] = await Promise.all([
    sb.from('team_members').select('id,name,title,role,color,initials,user_id,can_approve').eq('active', true).order('created_at'),
    sb.from('profiles').select('user_id,photo_url')
  ]);
  if (error) throw error;
  S.team = t || []; S.teamMap = Object.fromEntries(S.team.map(m => [m.id, m]));
  S.photos = Object.fromEntries((p || []).filter(x => x.photo_url).map(x => [x.user_id, x.photo_url]));
}
async function loadItems() {
  const { data, error } = await sb.from('hq_content').select('*').neq('stage', 'archived').order('created_at', { ascending: false }).limit(1000);
  if (error) { toast('خطأ في تحميل المحتوى'); console.error(error); return; }
  S.items = data || [];
}
async function logAct(item_id, action, from_stage, to_stage, note) {
  await sb.from('hq_activity').insert({ item_id, actor: S.me.id, action, from_stage: from_stage || null, to_stage: to_stage || null, note: note || null });
}
async function push(ids, title, body) {
  ids = [...new Set((ids || []).filter(id => id && id !== S.me.id && S.teamMap[id]))];
  if (!ids.length) return;
  const { error } = await sb.functions.invoke('send-push', { body: { external_ids: ids, title, body, url: location.origin + location.pathname + (location.hash || '') } });
  if (error) console.warn('push failed', error);
}
/* Move a content card to another stage: saves, logs the activity and notifies the right people. */
async function moveStage(it, to, opts = {}) {
  const from = it.stage; if (from === to && !opts.force) return;
  const patch = { stage: to };
  if (to === 'approved') { patch.approved_by = S.me.id; patch.approved_at = new Date().toISOString(); patch.changes_note = null; }
  if (opts.changes) { patch.changes_note = opts.changes; }
  if (to === 'review') patch.changes_note = null;
  if (opts.post_url !== undefined) patch.post_url = opts.post_url;
  if (!(await updateItem(it.id, patch, true))) return;
  await logAct(it.id, opts.changes ? 'changes' : 'stage', from, to, opts.changes || null);
  const team = [it.owner, ...(it.helpers || [])];
  if (to === 'review') push(approverIds(), '👀 محتوى للمراجعة', it.title);
  else if (to === 'approved') push(team, '✅ تمت الموافقة', it.title);
  else if (opts.changes) push(team, '✏️ مطلوب تعديلات', it.title + ' — ' + opts.changes);
  else if (to === 'posted') push([...team, ...approverIds()], '📣 تم النشر', it.title);
  else push(team, SM[to].n, it.title);
  toast(opts.changes ? 'تم إرسال طلب التعديل' : 'اتنقل إلى «' + SM[to].n + '»');
  renderAll();
}
async function updateItem(id, patch, silent) {
  const it = S.items.find(x => x.id === id); if (it) Object.assign(it, patch);
  const { error } = await sb.from('hq_content').update(patch).eq('id', id);
  if (error) { toast('لم يتم الحفظ — حاول مرة أخرى'); console.error(error); return false; }
  if (!silent) toast('تم الحفظ', 1100);
  return true;
}

/* ───────── LOGIN ───────── */
function loginShell(inner) {
  $('#app').innerHTML = '<div class="login"><div class="box"><img class="login-logo" src="assets/muhra-logo.png" alt="Muhra"><div class="muted" style="letter-spacing:.3em;font-size:11px;margin:6px 0 24px">HQ</div>' + inner + '</div></div>';
}
function renderLogin(err) {
  loginShell('<form id="lf" class="card pad" style="text-align:right" autocomplete="on">' +
    '<label class="lb" style="margin-top:0">اسم المستخدم أو الإيميل</label><input class="inp" id="lu" name="username" autocomplete="username" dir="ltr" autocapitalize="none" spellcheck="false" required>' +
    '<label class="lb">كلمة المرور</label><input class="inp" id="lp" name="password" type="password" autocomplete="current-password" dir="ltr" required>' +
    (err ? '<div class="alert bad">' + esc(err) + '</div>' : '') +
    '<button class="btn pri" id="lb" style="width:100%;margin-top:16px">دخول</button>' +
    '<div class="muted small" style="margin-top:12px;text-align:center">نسيت كلمة المرور؟ اطلب من المدير إعادة تعيينها.</div></form>');
  $('#lu').focus();
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    const u = $('#lu').value.trim().toLowerCase(), pw = $('#lp').value;
    if (!u || !pw) return;
    $('#lb').disabled = true; $('#lb').textContent = '...';
    const email = u.includes('@') ? u : u + '@' + LOGIN_DOMAIN;
    const { error } = await sb.auth.signInWithPassword({ email, password: pw });
    if (error) return renderLogin(/rate|many/i.test(error.message) ? 'محاولات كثيرة، استنى دقيقة وجرب تاني' : 'اسم المستخدم أو كلمة المرور غير صحيحة');
    afterSignIn();
  };
}
function renderChangePassword(forced, err) {
  loginShell('<form id="cf" class="card pad" style="text-align:right">' +
    '<div style="font-weight:700;margin-bottom:4px">' + (forced ? 'اختار كلمة مرور جديدة' : 'تغيير كلمة المرور') + '</div>' +
    '<div class="muted small">' + (forced ? 'دي أول مرة تدخل — غيّر كلمة المرور المؤقتة.' : '') + ' 8 حروف على الأقل.</div>' +
    '<label class="lb">كلمة المرور الجديدة</label><input class="inp" id="np1" type="password" autocomplete="new-password" dir="ltr" minlength="8" required>' +
    '<label class="lb">تأكيد كلمة المرور</label><input class="inp" id="np2" type="password" autocomplete="new-password" dir="ltr" minlength="8" required>' +
    (err ? '<div class="alert bad">' + esc(err) + '</div>' : '') +
    '<button class="btn pri" id="cb" style="width:100%;margin-top:16px">حفظ</button>' +
    (forced ? '' : '<button type="button" class="btn ghost" id="cc" style="width:100%;margin-top:6px">إلغاء</button>') + '</form>');
  $('#np1').focus();
  if (!forced) $('#cc').onclick = () => boot2();
  $('#cf').onsubmit = async e => {
    e.preventDefault();
    const a = $('#np1').value, b = $('#np2').value;
    if (a.length < 8) return renderChangePassword(forced, 'كلمة المرور لازم 8 حروف على الأقل');
    if (a !== b) return renderChangePassword(forced, 'كلمتين المرور مش متطابقين');
    $('#cb').disabled = true;
    const { error } = await sb.auth.updateUser({ password: a, data: { must_change_password: false } });
    if (error) return renderChangePassword(forced, /same|different/i.test(error.message) ? 'اختار كلمة مرور مختلفة عن القديمة' : 'تعذر الحفظ، حاول تاني');
    toast('تم تغيير كلمة المرور');
    afterSignIn();
  };
}
async function afterSignIn() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return renderLogin();
  try { await loadTeam(); } catch (e) { return renderLogin('تعذر الاتصال، حاول تاني'); }
  const me = S.team.find(m => m.user_id === session.user.id);
  if (!me) { await sb.auth.signOut(); localStorage.removeItem(UID_KEY); return renderLogin('الحساب ده مش عضو في الفريق'); }
  if (session.user.user_metadata && session.user.user_metadata.must_change_password) return renderChangePassword(true);
  S.me = me; lsS(UID_KEY, me.id);
  if (window.registerUserWithOneSignal) setTimeout(() => window.registerUserWithOneSignal(me.id), 1500);
  boot2();
  setTimeout(() => { if (typeof maybeAskPush === 'function') maybeAskPush(); }, 2500);
}
async function signOut() { await sb.auth.signOut(); localStorage.removeItem(UID_KEY); location.replace(location.pathname); }

/* ───────── SHELL & ROUTER ───────── */
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  board: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  tasks: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m8 12 3 3 5-6"/>',
  crown: '<path d="M2 19h20M4 19l1.5-10 5 4L12 6l1.5 7 5-4L20 19"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  intel: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  ugc: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M17 4.5v6M14 7.5h6"/>',
  ads: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  research: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  publish: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>',
  tools: '<path d="M4 7h16M4 12h10M4 17h6"/><path d="m17 14 3 3-3 3"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  team: '<circle cx="9" cy="7" r="4"/><path d="M1 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2"/><path d="M17 3.13a4 4 0 0 1 0 7.75M23 21v-2a4 4 0 0 0-3-3.87"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  bag: '<path d="M5 8h14l-1.2 12.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4"/>',
  pin: '<path d="M12 17v5M9 3h6l-1 7 4 3v2H6v-2l4-3z"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  film: '<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 3v18M17 3v18M2 8h5M2 16h5M17 8h5M17 16h5"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  clip: '<path d="m21.4 11-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  arrow: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.3.3 1.6 1.4 2.8 2.5 2.8z"/>',
  bulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  story: '<circle cx="12" cy="12" r="9" stroke-dasharray="3 2.4"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  play: '<path d="M6 4v16l14-8z"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  reply: '<path d="m9 17-5-5 5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>'
};
/* Small inline icon for labels, pills and buttons: one size, one stroke. */
function ic(k, s = 16) { return '<svg class="ic" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[k] || '') + '</svg>'; }
const icon = (k, s = 20) => '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[k] || '') + '</svg>';

function badges() {
  const me = S.me.id;
  const b = {};
  const late = S.items.filter(i => (i.owner === me || (i.helpers || []).includes(me)) && i.stage !== 'review' && isLate(i)).length;
  const review = isApprover() ? S.items.filter(i => i.stage === 'review').length : 0;
  b.home = late + review;
  b.content = review;
  b.tasks = S.tasks.filter(t => assigneesOf(t).includes(me) && t.status !== 'Done').length;
  b.chat = S.chat.filter(m => m.author !== me && new Date(m.created_at).getTime() > S.chatSeen).length;
  b.briefs = S.briefs.filter(x => (!x.assignees || !x.assignees.length || x.assignees.includes(me)) && dayDiff(x.created_at.slice(0, 10)) >= -1 && x.created_by !== me).length;
  b.ads = (S.ads || []).filter(a => a.status === 'new').length;
  return b;
}
const assigneesOf = t => (Array.isArray(t.assigned_to) ? t.assigned_to : [t.assigned_to]).filter(Boolean);

const SUBS = {
  home: '', content: 'كل الكروت من الفكرة للنشر', calendar: 'خطة النشر والأيام الفاضية', products: 'منتجات Shopify وصورها، مربوطة بالمحتوى والمهام', tasks: 'مهام الفريق بالحالة والأولوية',
  briefs: 'تعليمات صاحبة البراند والإدارة للفريق', chat: 'شات الفريق', intel: 'رصد المنافسين وأفضل بوستاتهم', ugc: 'متابعة صنّاع المحتوى',
  ads: 'إعلانات المنافسين من إضافة Adlumi', ideas: 'أفكار سريعة من أبحاث المنافسين', publish: 'طابور النشر التلقائي من Google Drive',
  tools: 'ضغط الصور والفيديو وإرفاقها بالكروت', stats: 'أرقام الأسبوع وأداء الفريق', team: 'الحساب، الإشعارات، والأعضاء'
};
const NEW_LBL = { content: 'محتوى جديد', task: 'مهمة جديدة', brief: 'بريف جديد' };
function renderShell() {
  $('#app').innerHTML =
    '<aside class="side" id="side"></aside>' +
    '<div class="shell">' +
      '<header class="top">' +
        '<a class="logo" href="#/home" aria-label="Muhra HQ"><img src="assets/muhra-logo.png" alt="Muhra"><span class="hq">HQ</span></a>' +
        '<div class="pgt"><h1 id="pgTitle"></h1><p id="pgSub"></p></div>' +
        '<div class="sp"></div>' +
        '<button class="searchbox" id="searchBtn" aria-label="بحث">' + icon('search', 17) + '<span>ابحث في كل حاجة…</span><kbd>/</kbd></button>' +
        '<button class="btn pri newbtn" id="newBtn"><b>+</b> <span id="newLbl"></span></button>' +
        '<button class="hbtn me" id="meBtn" aria-label="حسابي">' + av(S.me.id) + '</button>' +
      '</header>' +
      '<div class="phead" id="phead"><h1 id="pgTitleM"></h1><p id="pgSubM"></p></div>' +
      '<main id="view"></main><div id="frames" class="hidden"></div>' +
    '</div>' +
    '<button class="fab" id="fab" aria-label="جديد">' + '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>' + '</button><nav class="bottom" id="nav"></nav>';
  $('#fab').onclick = () => fabAction();
  $('#newBtn').onclick = () => fabAction();
  $('#meBtn').onclick = () => go('team');
  $('#searchBtn').onclick = () => openSearch();
  if (!window._hqKeys) {
    window._hqKeys = true;
    document.addEventListener('keydown', e => {
      if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && !e.target.closest('input,textarea,select,[contenteditable]') && S.me) { e.preventDefault(); openSearch(); }
      if (e.key === 'Escape' && $('#sheetRoot').innerHTML) closeSheet();
    });
  }
  renderNav();
}
function setPageHeader() {
  const r = RM[S.route] || RM.home;
  const t = r.n;
  const sub = S.route === 'home' ? fmtDay(today()) : (SUBS[S.route] || '');
  ['#pgTitle', '#pgTitleM'].forEach(q => { const el = $(q); if (el) el.textContent = t; });
  ['#pgSub', '#pgSubM'].forEach(q => { const el = $(q); if (el) el.textContent = sub; });
  const f = fabFor(), nb = $('#newBtn');
  if (nb) { nb.classList.toggle('hidden', !f); if (f) $('#newLbl').textContent = NEW_LBL[f]; }
  document.title = (S.route === 'home' ? '' : r.n + ' · ') + 'Muhra HQ';
}
/* Visual polish for everything rendered: no emoji in headings/labels, page title lives in the header. */
const LEAD_EMOJI = /^[\s\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]+/u;
function stripLeadEmoji(el) {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    if (!n.nodeValue.trim()) continue;
    if (n.parentElement && n.parentElement.closest('.av,.thumb,.sic,kbd')) return;
    const r = n.nodeValue.replace(LEAD_EMOJI, '');
    if (r === n.nodeValue) return;
    if (!r.trim()) { // whole node was an icon: drop it only if real text follows inside the same element
      if ((el.textContent || '').replace(LEAD_EMOJI, '').trim()) { n.nodeValue = ''; continue; }
      return;
    }
    n.nodeValue = r; return;
  }
}
const POLISH_SEL = 'h2.sec, .sectitle, .kcol h3, .btn, .chip, .stage-tag, .tg, .pill, .mg-label, label.lb, .slot b, .calday .hd b, .stepper button';
function polish(root) {
  root = root || document;
  root.querySelectorAll('h1.ptitle').forEach(h => { const nx = h.nextElementSibling; if (nx && nx.matches('.muted.small') && /-6px/.test(nx.getAttribute('style') || '')) nx.remove(); h.remove(); });
  root.querySelectorAll(POLISH_SEL).forEach(el => { if (el._p) return; el._p = 1; stripLeadEmoji(el); });
}
if (!window._hqPolishObs) {
  window._hqPolishObs = true;
  let pend = false;
  new MutationObserver(() => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; polish(document); }); })
    .observe(document.documentElement, { childList: true, subtree: true });
}
function navItem(r, b, cls) {
  const n = b[r.k] ? '<span class="dot">' + (b[r.k] > 99 ? '99+' : b[r.k]) + '</span>' : '';
  return '<button data-go="' + r.k + '" class="' + cls + (S.route === r.k ? ' on' : '') + '">' + icon(r.ic, cls === 'sitem' ? 18 : 22) + '<span>' + r.n + '</span>' + n + '</button>';
}
function renderNav() {
  if (!$('#nav')) return;
  const b = badges();
  $('#side').innerHTML = '<a class="sbrand" href="#/home"><img src="assets/muhra-logo.png" alt="Muhra"><span>HQ</span></a>' +
    '<button class="sfind" data-sfind="1">' + icon('search', 16) + '<span>بحث</span><kbd>/</kbd></button>' +
    '<div class="snav">' + Object.entries(GROUPS).map(([g, gn]) => '<div class="sgroup"><div class="sglabel">' + gn + '</div>' + ROUTES.filter(r => r.g === g).map(r => navItem(r, b, 'sitem')).join('') + '</div>').join('') + '</div>' +
    '<button class="sfoot" data-go="team">' + av(S.me.id) + '<span class="grow"><b>' + esc(S.me.name) + '</b><small>' + (S.me.role === 'admin' ? 'مدير' : 'عضو') + (S.me.title ? ' · ' + esc(S.me.title) : '') + '</small></span></button>';
  const sf = $('[data-sfind]'); if (sf) sf.onclick = () => openSearch();
  const inMore = !MOBILE_TABS.includes(S.route);
  const moreCount = ROUTES.filter(r => !MOBILE_TABS.includes(r.k)).reduce((a, r) => a + (b[r.k] || 0), 0);
  $('#nav').innerHTML = MOBILE_TABS.map(k => navItem(RM[k], b, 'tab')).join('') +
    '<button data-more="1" class="tab' + (inMore ? ' on' : '') + '">' + icon(inMore ? RM[S.route].ic : 'more', 22) + '<span>' + (inMore ? RM[S.route].n.split(' ')[0] : 'المزيد') + '</span>' + (moreCount ? '<span class="dot">' + moreCount + '</span>' : '') + '</button>';
  $$('[data-go]', $('#app')).forEach(el => el.onclick = () => go(el.dataset.go));
  $('[data-more]').onclick = () => openMoreMenu();
}
function openMoreMenu() {
  const b = badges();
  const root = sheet('<div class="sh"><b class="grow">كل الأقسام</b><button class="btn ghost sm" id="x">' + ic('x') + '</button></div><div class="sb"><div class="menu-grid">' +
    Object.entries(GROUPS).map(([g, gn]) => '<div class="mg-label">' + gn + '</div>' + ROUTES.filter(r => r.g === g).map(r =>
      '<button class="mg-item' + (S.route === r.k ? ' on' : '') + '" data-mgo="' + r.k + '">' + icon(r.ic, 24) + '<span>' + r.n + '</span>' + (b[r.k] ? '<i class="dot">' + b[r.k] + '</i>' : '') + '</button>').join('')).join('') +
    '</div></div>');
  $('#x').onclick = closeSheet;
  $$('[data-mgo]', root).forEach(el => el.onclick = () => { closeSheet(); go(el.dataset.mgo); });
}
const FRAME_ROUTES = ['intel', 'ugc', 'tools'];
function go(route, arg) {
  if (!RM[route]) route = 'home';
  location.hash = '#/' + route + (arg ? '/' + arg : '');
}
function applyHash() {
  const h = location.hash || '';
  let m;
  const deep = h.match(/^#(item|task)=([0-9a-f-]{36})/);
  if (deep) {
    if (!S._rendered) { S._rendered = true; setRoute(deep[1] === 'task' ? 'tasks' : S.route); }
    if (deep[1] === 'item' && S.openId !== deep[2]) openItem(deep[2]);
    if (deep[1] === 'task' && S.openTaskId !== deep[2]) openTask(deep[2]);
    return;
  }
  S._rendered = true;
  if (h === '#team') { setRoute('team'); return; }
  m = h.match(/^#\/([a-z]+)(?:\/(.+))?/);
  setRoute(m && RM[m[1]] ? m[1] : 'home', m && m[2] ? decodeURIComponent(m[2]) : null);
}
function setRoute(route, arg) {
  const changed = route !== S.route;
  S.route = route; S.routeArg = arg || null;
  if (changed) { $('#sheetRoot').innerHTML = ''; S.openId = null; S.openTaskId = null; }
  document.body.dataset.route = route;
  renderAll();
  if (changed) window.scrollTo(0, 0);
}
const VIEWS = {};       // filled by each module file
function renderAll() {
  if (!S.me || !$('#view')) return;
  renderNav();
  const v = $('#view');
  const isFrame = FRAME_ROUTES.includes(S.route);
  document.body.classList.toggle('frame-mode', isFrame);
  if (isFrame) { showFrame(S.route, S.routeArg); }
  else {
    hideFrames();
    v.classList.remove('hidden');
    (VIEWS[S.route] || VIEWS.home)(v);
    $$('[data-open]', v).forEach(el => el.onclick = e => { if (e.target.closest('button,a,input,select,textarea')) return; openItem(el.dataset.open); });
    $$('[data-task]', v).forEach(el => el.onclick = e => { if (e.target.closest('button,a,input,select,textarea')) return; openTask(el.dataset.task); });
  }
  const fab = $('#fab'); if (fab) fab.classList.toggle('hidden', !fabFor());
  setPageHeader();
  if (S.openId && typeof refreshSheetLive === 'function') refreshSheetLive();
  if (S.openTaskId && typeof refreshTaskLive === 'function') refreshTaskLive();
}
function fabFor() {
  if (['home', 'content', 'calendar', 'ideas', 'products'].includes(S.route)) return 'content';
  if (S.route === 'tasks' && isAdmin()) return 'task';
  if (S.route === 'briefs' && canBrief()) return 'brief';
  return null;
}
function fabAction() {
  const f = fabFor();
  if (f === 'content') newItem();
  else if (f === 'task') newTask();
  else if (f === 'brief') newBrief();
}
const canBrief = () => isApprover() || isAdmin();

/* ───────── GLOBAL SEARCH ───────── */
function openSearch() {
  const root = sheet('<div class="sh"><input class="inp" id="gq" placeholder="ابحث في المحتوى، المنتجات، المهام، البريفات، الإعلانات، الشات…" autocomplete="off"><button class="btn ghost sm" id="x">' + ic('x') + '</button></div><div class="sb" id="gres"><div class="muted small" style="padding:14px">اكتب كلمتين على الأقل</div></div>');
  $('#x').onclick = closeSheet;
  const q = $('#gq'); q.focus();
  q.oninput = () => {
    const t = q.value.trim().toLowerCase(), out = $('#gres');
    if (t.length < 2) { out.innerHTML = '<div class="muted small" style="padding:14px">اكتب كلمتين على الأقل</div>'; return; }
    const has = (...xs) => xs.some(x => String(x || '').toLowerCase().includes(t));
    const sec = (title, rows) => rows.length ? '<div class="sectitle">' + title + ' <span class="muted small">' + rows.length + '</span></div><div class="card">' + rows.slice(0, 8).join('') + '</div>' : '';
    const row = (attr, ic, title, sub) => '<button class="srow" ' + attr + '><span class="sic">' + ic + '</span><span class="grow"><b>' + esc(title) + '</b>' + (sub ? '<div class="muted small">' + esc(sub) + '</div>' : '') + '</span></button>';
    const html =
      sec('المحتوى', S.items.filter(i => has(i.title, i.brief, i.caption, i.script, i.product)).map(i => row('data-sitem="' + i.id + '"', typeIc(i.type), i.title, SM[i.stage].n + (i.owner ? ' · ' + firstName(i.owner) : '')))) +
      sec('المنتجات', (S.products || []).filter(p => has(p.title, p.handle, ...(p.collections || []), ...(p.variants || []).map(x => x.sku))).map(p => row('data-sprod="' + esc(p.id) + '"', ic('bag'), p.title, prodPrice(p) + ((p.collections || [])[0] ? ' · ' + p.collections[0] : '')))) +
      sec('المهام', S.tasks.filter(x => has(x.title, x.description)).map(x => row('data-stask="' + x.id + '"', ic('tasks'), x.title, statusAr(x.status) + ' · ' + assigneesOf(x).map(firstName).join('، ')))) +
      sec('البريفات', S.briefs.filter(x => has(x.text, x.notes)).map(x => row('data-sbrief="' + x.id + '"', ic('crown'), (x.text || 'بريف صوتي').slice(0, 70), fmtTime(x.created_at)))) +
      sec('الإعلانات', (S.ads || []).filter(a => has(a.advertiser, a.headline, a.body)).map(a => row('data-sad="' + a.id + '"', ic('ads'), a.advertiser || a.landing_domain || 'إعلان', (a.headline || a.body || '').slice(0, 60)))) +
      sec('الشات', S.chat.filter(m => has(m.text)).slice(-20).reverse().map(m => row('data-schat="1"', ic('msg'), (m.text || '').slice(0, 70), firstName(m.author) + ' · ' + fmtTime(m.created_at))));
    out.innerHTML = html || '<div class="empty" style="margin:14px">مفيش نتائج</div>';
    $$('[data-sitem]', out).forEach(b => b.onclick = () => openItem(b.dataset.sitem));
    $$('[data-stask]', out).forEach(b => b.onclick = () => openTask(b.dataset.stask));
    $$('[data-sprod]', out).forEach(b => b.onclick = () => openProduct(b.dataset.sprod));
    $$('[data-sbrief]', out).forEach(b => b.onclick = () => { closeSheet(); go('briefs', b.dataset.sbrief); });
    $$('[data-sad]', out).forEach(b => b.onclick = () => openAd(b.dataset.sad));
    $$('[data-schat]', out).forEach(b => b.onclick = () => { closeSheet(); go('chat'); });
  };
}

/* ───────── REALTIME ───────── */
const rt = {};
function debounce(key, fn, ms = 500) { clearTimeout(rt[key]); rt[key] = setTimeout(fn, ms); }
function subscribe() {
  if (S._sub) return; S._sub = true;
  sb.channel('hub-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hq_content' }, () => debounce('c', async () => { await loadItems(); renderAll(); }, 600))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hq_comments' }, p => { if (p.new && p.new.item_id === S.openId) loadThread(S.openId); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => debounce('t', async () => { await loadTasks(); renderAll(); }, 500))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => debounce('t', async () => { await loadTasks(); renderAll(); }, 500))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'edit_requests' }, () => debounce('t', async () => { await loadTasks(); renderAll(); }, 500))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'maha_briefs' }, () => debounce('b', async () => { await loadBriefs(); renderAll(); }, 500))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'brief_comments' }, p => { if (p.new) { delete S.briefCmts[p.new.brief_id]; if (S.route === 'briefs') debounce('bc', () => renderAll(), 300); } })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat' }, p => { if (p.new && !S.chat.find(m => m.id === p.new.id)) { S.chat.push(p.new); if (S.route === 'chat') markChatSeen(); renderAll(); } })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hq_ads' }, () => debounce('a', async () => { await loadAds(); renderAll(); }, 800))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hq_products' }, () => debounce('pr', async () => { if (S._prodSyncing) return; await loadProducts(); renderAll(); }, 2500))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => debounce('p', async () => { await loadTeam(); renderAll(); }, 800))
    .subscribe();
  document.addEventListener('visibilitychange', async () => { if (!document.hidden && S.me) { await Promise.all([loadItems(), loadTasks(), loadBriefs(), loadChat()]); renderAll(); } });
}

/* ───────── BOOT ───────── */
async function boot() {
  loginShell('<p class="muted">جاري التحميل…</p>');
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return renderLogin();
  afterSignIn();
}
sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT' && S.me) { S.me = null; localStorage.removeItem(UID_KEY); renderLogin('انتهت الجلسة، سجل الدخول تاني'); } });
async function boot2() {
  renderShell();
  $('#view').innerHTML = '<div class="empty">جاري التحميل…</div>';
  await Promise.all([loadItems(), loadTasks(), loadBriefs(), loadChat(), loadAds(), loadProducts()]);
  subscribe();
  if (!S._listeners) {
    S._listeners = true;
    window.addEventListener('hashchange', applyHash);
    window.addEventListener('message', onModuleMessage);
    let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (['content'].includes(S.route)) renderAll(); }, 250); });
  }
  if (!location.hash || location.hash === '#') history.replaceState(null, '', '#/home');
  applyHash();
}
