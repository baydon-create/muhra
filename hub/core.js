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
  { k: 'idea', n: 'فكرة', ic: '💡', bg: '#F1ECE6', fg: '#6B5A4D' },
  { k: 'script', n: 'سكريبت', ic: '✍️', bg: '#EDE7F3', fg: '#5B4A7A' },
  { k: 'shoot', n: 'تصوير', ic: '🎥', bg: '#E6EEF5', fg: '#365F80' },
  { k: 'edit', n: 'مونتاج', ic: '✂️', bg: '#F5EBDD', fg: '#8A5A1F' },
  { k: 'review', n: 'مراجعة', ic: '👀', bg: '#FBF0DC', fg: '#A26A10' },
  { k: 'approved', n: 'معتمد', ic: '✅', bg: '#E5F0E8', fg: '#3F7A57' },
  { k: 'scheduled', n: 'مجدول', ic: '🗓️', bg: '#E3EEF0', fg: '#2F6970' },
  { k: 'posted', n: 'منشور', ic: '📣', bg: '#E9E4DE', fg: '#5C3D2E' }
];
const SI = Object.fromEntries(STAGES.map((s, i) => [s.k, i]));
const SM = Object.fromEntries(STAGES.map(s => [s.k, s]));
const TYPES = { reel: 'ريل', carousel: 'كاروسيل', post: 'بوست', story: 'ستوري', tiktok: 'تيك توك', ad: 'إعلان' };
const TYPE_IC = { reel: '🎬', carousel: '🖼️', post: '📷', story: '⭕', tiktok: '🎵', ad: '📢' };
const PLATFORMS = { instagram: 'إنستجرام', tiktok: 'تيك توك', facebook: 'فيسبوك' };
const PILLARS = ['إطلاق منتج', 'تنسيقات', 'كواليس', 'آراء عملاء / UGC', 'عروض', 'تعليمي / مقاسات', 'براند'];
const DONE_STAGES = ['approved', 'scheduled', 'posted'];
const AR_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/* Every screen of the hub. group decides where it sits in the menu. */
const ROUTES = [
  { k: 'home', n: 'اليوم', ic: 'home', g: 'work' },
  { k: 'content', n: 'المحتوى', ic: 'board', g: 'work' },
  { k: 'calendar', n: 'التقويم', ic: 'cal', g: 'work' },
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
const nameOf = id => (S.teamMap[id] && S.teamMap[id].name) || (id === 'deleted_member' ? 'عضو محذوف' : id) || '—';
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
function stageTag(k) { const s = SM[k] || STAGES[0]; return '<span class="stage-tag" style="background:' + s.bg + ';color:' + s.fg + '">' + s.ic + ' ' + s.n + '</span>'; }
function dueInfo(it) {
  if (DONE_STAGES.includes(it.stage)) return '';
  const out = [];
  if (it.due_date) { const d = dayDiff(it.due_date); out.push('<span class="pill ' + (d < 0 ? 'late' : d <= 1 ? 'soon' : '') + '">⏱ ' + (d < 0 ? 'متأخر ' + (-d) + ' يوم' : d === 0 ? 'اليوم' : d === 1 ? 'بكرة' : fmtShort(it.due_date)) + '</span>'); }
  if (it.publish_date) { const d = dayDiff(it.publish_date); if (d <= 2) out.push('<span class="pill ' + (d < 0 ? 'late' : 'soon') + '">📅 نشر ' + (d < 0 ? 'فات' : d === 0 ? 'اليوم' : d === 1 ? 'بكرة' : fmtShort(it.publish_date)) + '</span>'); }
  return out.join('');
}
const isLate = it => !DONE_STAGES.includes(it.stage) && ((it.due_date && dayDiff(it.due_date) < 0) || (it.publish_date && dayDiff(it.publish_date) < 0));
function itemThumb(it) {
  const img = (it.files || []).find(f => /\.(jpe?g|png|webp|gif|heic)$/i.test(f.name || f.url || ''));
  const u = (img && img.url) || it.ref_thumb;
  return u ? '<div class="thumb" style="background-image:url(\'' + esc(u) + '\')"></div>' : '<div class="thumb">' + (TYPE_IC[it.type] || '📄') + '</div>';
}
function ccard(it, opts = {}) {
  return '<div class="card ccard" data-open="' + it.id + '">' + itemThumb(it) +
    '<div class="grow"><div class="t">' + esc(it.title) + '</div><div class="meta">' +
    (opts.noStage ? '' : stageTag(it.stage)) +
    '<span class="pill">' + (TYPE_IC[it.type] || '') + ' ' + (TYPES[it.type] || it.type) + '</span>' + dueInfo(it) +
    (it.changes_note && it.stage === 'edit' ? '<span class="pill late">✏️ تعديلات</span>' : '') +
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
  const { error } = await sb.functions.invoke('send-push', { body: { external_ids: ids, title, body } });
  if (error) console.warn('push failed', error);
}
async function updateItem(id, patch, silent) {
  const it = S.items.find(x => x.id === id); if (it) Object.assign(it, patch);
  const { error } = await sb.from('hq_content').update(patch).eq('id', id);
  if (error) { toast('لم يتم الحفظ — حاول مرة أخرى'); console.error(error); return false; }
  if (!silent) toast('تم الحفظ ✓', 1100);
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
    toast('تم تغيير كلمة المرور ✓');
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
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'
};
const icon = (k, s = 20) => '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[k] || '') + '</svg>';

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

function renderShell() {
  $('#app').innerHTML =
    '<header class="top"><a class="logo" href="#/home" aria-label="Muhra HQ"><img src="assets/muhra-logo-light.png" alt="Muhra"></a><span class="hq">HQ</span>' +
    '<div class="sp"></div><button class="hbtn" id="searchBtn" aria-label="بحث">' + icon('search', 19) + '</button>' +
    '<button class="hbtn" id="meBtn" aria-label="حسابي">' + av(S.me.id) + '</button></header>' +
    '<div class="layout"><aside class="side" id="side"></aside><main id="view"></main><div id="frames" class="hidden"></div></div>' +
    '<button class="fab" id="fab" aria-label="جديد">+</button><nav class="bottom" id="nav"></nav>';
  $('#fab').onclick = () => fabAction();
  $('#meBtn').onclick = () => go('team');
  $('#searchBtn').onclick = () => openSearch();
  renderNav();
}
function navItem(r, b, cls) {
  const n = b[r.k] ? '<span class="dot">' + (b[r.k] > 99 ? '99+' : b[r.k]) + '</span>' : '';
  return '<button data-go="' + r.k + '" class="' + cls + (S.route === r.k ? ' on' : '') + '">' + icon(r.ic, cls === 'sitem' ? 18 : 22) + '<span>' + r.n + '</span>' + n + '</button>';
}
function renderNav() {
  if (!$('#nav')) return;
  const b = badges();
  $('#side').innerHTML = Object.entries(GROUPS).map(([g, gn]) => '<div class="sgroup"><div class="sglabel">' + gn + '</div>' + ROUTES.filter(r => r.g === g).map(r => navItem(r, b, 'sitem')).join('') + '</div>').join('') +
    '<div class="sfoot">' + av(S.me.id) + '<span class="grow">' + esc(S.me.name) + '</span></div>';
  const inMore = !MOBILE_TABS.includes(S.route);
  const moreCount = ROUTES.filter(r => !MOBILE_TABS.includes(r.k)).reduce((a, r) => a + (b[r.k] || 0), 0);
  $('#nav').innerHTML = MOBILE_TABS.map(k => navItem(RM[k], b, 'tab')).join('') +
    '<button data-more="1" class="tab' + (inMore ? ' on' : '') + '">' + icon(inMore ? RM[S.route].ic : 'more', 22) + '<span>' + (inMore ? RM[S.route].n.split(' ')[0] : 'المزيد') + '</span>' + (moreCount ? '<span class="dot">' + moreCount + '</span>' : '') + '</button>';
  $$('[data-go]', $('#app')).forEach(el => el.onclick = () => go(el.dataset.go));
  $('[data-more]').onclick = () => openMoreMenu();
}
function openMoreMenu() {
  const b = badges();
  const root = sheet('<div class="sh"><b class="grow">كل الأقسام</b><button class="btn ghost sm" id="x">✕</button></div><div class="sb"><div class="menu-grid">' +
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
  if (S.openId && typeof refreshSheetLive === 'function') refreshSheetLive();
  if (S.openTaskId && typeof refreshTaskLive === 'function') refreshTaskLive();
}
function fabFor() {
  if (['home', 'content', 'calendar', 'ideas'].includes(S.route)) return 'content';
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
  const root = sheet('<div class="sh"><input class="inp" id="gq" placeholder="ابحث في المحتوى، المهام، البريفات، الإعلانات، الشات…" autocomplete="off"><button class="btn ghost sm" id="x">✕</button></div><div class="sb" id="gres"><div class="muted small" style="padding:14px">اكتب كلمتين على الأقل</div></div>');
  $('#x').onclick = closeSheet;
  const q = $('#gq'); q.focus();
  q.oninput = () => {
    const t = q.value.trim().toLowerCase(), out = $('#gres');
    if (t.length < 2) { out.innerHTML = '<div class="muted small" style="padding:14px">اكتب كلمتين على الأقل</div>'; return; }
    const has = (...xs) => xs.some(x => String(x || '').toLowerCase().includes(t));
    const sec = (title, rows) => rows.length ? '<div class="sectitle">' + title + ' <span class="muted small">' + rows.length + '</span></div><div class="card">' + rows.slice(0, 8).join('') + '</div>' : '';
    const row = (attr, ic, title, sub) => '<button class="srow" ' + attr + '><span class="sic">' + ic + '</span><span class="grow"><b>' + esc(title) + '</b>' + (sub ? '<div class="muted small">' + esc(sub) + '</div>' : '') + '</span></button>';
    const html =
      sec('المحتوى', S.items.filter(i => has(i.title, i.brief, i.caption, i.script, i.product)).map(i => row('data-sitem="' + i.id + '"', TYPE_IC[i.type] || '📄', i.title, SM[i.stage].n + (i.owner ? ' · ' + firstName(i.owner) : '')))) +
      sec('المهام', S.tasks.filter(x => has(x.title, x.description)).map(x => row('data-stask="' + x.id + '"', '☑️', x.title, statusAr(x.status) + ' · ' + assigneesOf(x).map(firstName).join('، ')))) +
      sec('البريفات', S.briefs.filter(x => has(x.text, x.notes)).map(x => row('data-sbrief="' + x.id + '"', '👑', (x.text || 'بريف صوتي').slice(0, 70), fmtTime(x.created_at)))) +
      sec('الإعلانات', (S.ads || []).filter(a => has(a.advertiser, a.headline, a.body)).map(a => row('data-sad="' + a.id + '"', '📢', a.advertiser || a.landing_domain || 'إعلان', (a.headline || a.body || '').slice(0, 60)))) +
      sec('الشات', S.chat.filter(m => has(m.text)).slice(-20).reverse().map(m => row('data-schat="1"', '💬', (m.text || '').slice(0, 70), firstName(m.author) + ' · ' + fmtTime(m.created_at))));
    out.innerHTML = html || '<div class="empty" style="margin:14px">مفيش نتائج</div>';
    $$('[data-sitem]', out).forEach(b => b.onclick = () => openItem(b.dataset.sitem));
    $$('[data-stask]', out).forEach(b => b.onclick = () => openTask(b.dataset.stask));
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
  await Promise.all([loadItems(), loadTasks(), loadBriefs(), loadChat(), loadAds()]);
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
