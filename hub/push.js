/* Muhra HQ – push notifications for the web app (no App Store / Play Store needed).
   Android + computers: Chrome/Edge/Firefox web push straight from the browser.
   iPhone/iPad: iOS 16.4+ web push, which Apple only allows after "Add to Home Screen". */

const PUSH_ENV = (() => {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  const iosInApp = ios && !/Safari/.test(ua) && !standalone; // Instagram/WhatsApp in-app browser etc.
  return { ios, standalone, supported, iosInApp, android: /Android/.test(ua) };
})();
let _installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); _installEvt = e; window.hqPushChanged && window.hqPushChanged(); });

function pushState() {
  if (PUSH_ENV.ios && !PUSH_ENV.standalone) return 'ios-install';
  if (!PUSH_ENV.supported) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'granted') return 'on';
  return 'off';
}

/* Must be called straight from a tap: iPhone and Chrome only show the permission prompt for a user gesture. */
function hqEnablePush() {
  const st = pushState();
  if (st === 'ios-install') return openPushHelp();
  if (st === 'unsupported') return toast('المتصفح ده مش بيدعم الإشعارات. افتح الرابط من Chrome أو Safari', 3500);
  if (st === 'denied') return openPushHelp();
  const done = (perm) => {
    if (perm === 'granted' || perm === true) {
      window.registerUserWithOneSignal && window.registerUserWithOneSignal(S.me.id);
      toast('✅ الإشعارات اتفعّلت على الجهاز ده', 2600);
      setTimeout(() => { loadPushStatus(); }, 4000);
    } else if (Notification.permission === 'denied') openPushHelp();
    else toast('لازم تضغط «سماح» عشان توصلك الإشعارات', 3000);
    hqPushChanged();
  };
  let p;
  try {
    p = (window.OneSignal && window.OneSignal.Notifications && window.OneSignal.Notifications.requestPermission)
      ? window.OneSignal.Notifications.requestPermission().then(() => Notification.permission)
      : Notification.requestPermission();
  } catch (e) { p = Notification.requestPermission(); }
  Promise.resolve(p).then(done, () => done(Notification.permission));
}

function pushHelpHtml() {
  const st = pushState();
  if (st === 'ios-install') return '<div class="ph-steps">' +
    (PUSH_ENV.iosInApp ? '<div class="alert warn" style="margin-bottom:10px">افتح الرابط في <b>Safari</b> الأول (مش من داخل واتساب أو إنستجرام).</div>' : '') +
    '<ol><li>اضغط زرار <b>المشاركة</b> <span class="ph-ic">⬆️</span> تحت في Safari</li>' +
    '<li>اختار <b>«إضافة إلى الشاشة الرئيسية»</b> <span class="ph-ic">➕</span></li>' +
    '<li>افتح <b>Muhra HQ</b> من الأيقونة اللي ظهرت على الشاشة</li>' +
    '<li>اضغط <b>«تفعيل الإشعارات»</b> ثم <b>«سماح»</b></li></ol>' +
    '<div class="muted small">محتاج iOS 16.4 أو أحدث. الإشعارات على الآيفون بتشتغل بس من الأيقونة، مش من Safari.</div></div>';
  if (st === 'denied') return '<div class="ph-steps"><div class="alert warn" style="margin-bottom:10px">الإشعارات مقفولة للموقع ده على الجهاز.</div>' +
    (PUSH_ENV.ios ? '<ol><li>افتح <b>الإعدادات</b> في الآيفون ← <b>الإشعارات</b></li><li>اختار <b>Muhra HQ</b> وفعّل <b>السماح بالإشعارات</b></li><li>ارجع للتطبيق</li></ol>'
      : PUSH_ENV.android ? '<ol><li>اضغط على 🔒 أو ⋮ جنب الرابط فوق ← <b>الأذونات</b> أو <b>إعدادات الموقع</b></li><li><b>الإشعارات</b> ← <b>سماح</b></li><li>ارجع واعمل تحديث للصفحة</li></ol>'
      : '<ol><li>اضغط على 🔒 جنب الرابط فوق</li><li>خلّي <b>الإشعارات</b> = <b>سماح</b></li><li>اعمل تحديث للصفحة</li></ol>') + '</div>';
  return '';
}
function openPushHelp() {
  sheet('<div class="sh"><button class="btn ghost sm" onclick="closeSheet()">✕</button><b class="grow">🔔 تفعيل الإشعارات</b></div><div class="pad">' + pushHelpHtml() +
    '<button class="btn pri" style="width:100%;margin-top:12px" onclick="closeSheet()">تمام</button></div>');
}

/* Banner shown on Home (and Team) until this device can receive notifications. */
function webPushBanner(force) {
  const st = pushState();
  if (st === 'on' && !force) return '';
  if (st === 'on') return '<div class="card pad pushcard on"><div class="row"><div class="grow"><b>🔔 الإشعارات شغالة على الجهاز ده</b><div class="muted small">لو غيّرت الموبايل أو المتصفح، فعّلها تاني هناك.</div></div>' +
    '<button class="btn sm" data-pushtest="1">إشعار تجريبي</button></div></div>';
  const title = st === 'denied' ? 'الإشعارات مقفولة على الجهاز ده' : st === 'ios-install' ? 'ثبّت Muhra HQ على الآيفون عشان توصلك الإشعارات' : 'فعّل الإشعارات عشان ميفوتكش أي شغل';
  const btn = st === 'ios-install' ? 'إزاي؟' : st === 'denied' ? 'إزاي أفتحها؟' : st === 'unsupported' ? '' : '🔔 تفعيل الإشعارات';
  return '<div class="card pad pushcard"><div class="row"><div style="font-size:26px">🔔</div><div class="grow"><b>' + title + '</b>' +
    '<div class="muted small">مهام جديدة، موافقات، تعديلات، منشن، وبريفات د. مها هتوصلك على الموبايل حتى والتطبيق مقفول.</div></div></div>' +
    '<div class="row wrap" style="margin-top:10px">' + (btn ? '<button class="btn pri sm" data-pushon="1">' + btn + '</button>' : '<span class="muted small">افتح الرابط من Chrome أو Safari.</span>') +
    (_installEvt && !PUSH_ENV.standalone ? '<button class="btn sm" data-install="1">📲 ثبّت التطبيق</button>' : '') + '</div></div>';
}
function bindWebPush(v) {
  v.querySelectorAll('[data-pushon]').forEach(b => b.onclick = hqEnablePush);
  v.querySelectorAll('[data-pushtest]').forEach(b => b.onclick = sendTestPush);
  v.querySelectorAll('[data-install]').forEach(b => b.onclick = async () => { if (!_installEvt) return; _installEvt.prompt(); await _installEvt.userChoice.catch(() => {}); _installEvt = null; hqPushChanged(); });
}

async function sendTestPush() {
  toast('بنبعت إشعار تجريبي…');
  const { data, error } = await sb.functions.invoke('send-push', { body: { external_ids: [S.me.id], title: '🔔 Muhra HQ', body: 'تمام! الإشعارات شغالة على جهازك.', url: HUB_URL } });
  if (error || !data || !data.ok) toast('لسه الجهاز مش مسجّل. استنى دقيقة وجرّب تاني، أو فعّل الإشعارات من جديد', 4000);
  else toast('اتبعت ✅ لو موصلش خلال دقيقة، فعّل الإشعارات تاني', 3500);
}

/* Who on the team has notifications on (any device). */
async function loadPushStatus() {
  const { data, error } = await sb.rpc('hq_push_status');
  if (error) return;
  S.pushStatus = {}; (data || []).forEach(r => S.pushStatus[r.member_id] = r);
  if (S.route === 'team') renderAll();
}
function webPushPill(id) {
  const r = S.pushStatus && S.pushStatus[id];
  if (!r) return '';
  return r.devices > 0 ? '<span class="pill okp" title="آخر تحديث ' + esc(String(r.last_seen || '').slice(0, 10)) + '">🔔 الإشعارات شغالة' + (r.devices > 1 ? ' (' + r.devices + ' أجهزة)' : '') + '</span>'
    : '<span class="pill badp">🔕 الإشعارات مش مفعّلة</span>';
}

const HUB_URL = 'https://baydon-create.github.io/muhra/';
let _pushRerender = null;
window.hqPushChanged = function () {
  clearTimeout(_pushRerender);
  _pushRerender = setTimeout(() => { if (S.me && (S.route === 'home' || S.route === 'team') && !$('#sheetRoot').innerHTML) renderAll(); }, 300);
};

/* (old) One clear prompt after sign-in (max once a day per device) so nobody misses this step. */
function maybeAskWebPush() {
  const st = pushState();
  if (st === 'on' || st === 'unsupported' || !S.me) return;
  const k = 'hq_push_ask_' + S.me.id, last = +localStorage.getItem(k) || 0;
  if (Date.now() - last < 20 * 3600e3) return;
  if ($('#sheetRoot').innerHTML) return;
  try { localStorage.setItem(k, String(Date.now())); } catch (e) {}
  sheet('<div class="sh"><button class="btn ghost sm" onclick="closeSheet()">✕</button><b class="grow">🔔 خطوة مهمة</b></div><div class="pad">' +
    '<p style="margin:0 0 12px">فعّل الإشعارات عشان توصلك المهام والموافقات والتعديلات والمنشن على الموبايل فورًا.</p>' +
    (st === 'off' ? '<button class="btn pri" id="pushNow" style="width:100%">🔔 تفعيل الإشعارات</button>' : pushHelpHtml()) +
    '<button class="btn" style="width:100%;margin-top:8px" onclick="closeSheet()">بعدين</button></div>');
  const b = $('#pushNow'); if (b) b.onclick = () => { closeSheet(); hqEnablePush(); };
}


/* ================= Telegram: the main notification channel ================= */
const TG_BOT = 'Muhra_team_bot';
S.tg = S.tg || null; let _tgCode = null, _tgCodeAt = 0, _tgPoll = null;

async function loadTgStatus() {
  const { data, error } = await sb.rpc('hq_telegram_status');
  if (error) return;
  const before = JSON.stringify(S.tg), was = S.tg && S.me && S.tg[S.me.id];
  S.tg = {}; (data || []).forEach(r => S.tg[r.member_id] = r);
  const now = S.me && S.tg[S.me.id];
  if (was && !was.linked && now && now.linked) { toast('✅ تليجرام اتربط! الإشعارات هتوصلك هناك', 3500); clearInterval(_tgPoll); if ($('.pushcard-in')) closeSheet(); }
  if (before !== JSON.stringify(S.tg)) hqPushChanged();
}
function tgLinked(id) { return !!(S.tg && S.tg[id || S.me.id] && S.tg[id || S.me.id].linked); }

/* The link is prepared ahead so the tap opens Telegram directly (works inside the iPhone home-screen app too). */
async function tgPrepareLink() {
  if (_tgCode && Date.now() - _tgCodeAt < 10 * 60e3) return _tgCode;
  const { data, error } = await sb.rpc('hq_telegram_code');
  if (error || !data) return null;
  _tgCode = data; _tgCodeAt = Date.now();
  document.querySelectorAll('a[data-tglink]').forEach(a => a.href = 'https://t.me/' + TG_BOT + '?start=' + _tgCode);
  return _tgCode;
}
function tgStartPolling() {
  clearInterval(_tgPoll); let n = 0;
  _tgPoll = setInterval(() => { if (++n > 60 || tgLinked()) return clearInterval(_tgPoll); loadTgStatus(); }, 4000);
}

function pushBanner(force) {
  if (!S.tg) { loadTgStatus(); return ''; }
  if (tgLinked()) {
    if (!force) return '';
    const r = S.tg[S.me.id];
    return '<div class="card pad pushcard on"><div class="row wrap"><div class="grow"><b>✅ تليجرام مربوط</b><div class="muted small">كل إشعارات HQ بتوصلك على بوت تليجرام <span dir="ltr">@' + TG_BOT + '</span>' + (r.linked_at ? ' · من ' + esc(String(r.linked_at).slice(0, 10)) : '') + '</div></div>' +
      '<button class="btn sm" data-pushtest="1">إشعار تجريبي</button><button class="btn sm ghost" data-tgunlink="1">فصل</button></div></div>';
  }
  const href = _tgCode ? 'https://t.me/' + TG_BOT + '?start=' + _tgCode : 'https://t.me/' + TG_BOT;
  setTimeout(tgPrepareLink, 0);
  return '<div class="card pad pushcard"><div class="row"><div style="font-size:26px">📨</div><div class="grow"><b>اربط تليجرام عشان توصلك الإشعارات</b>' +
    '<div class="muted small">مهام جديدة، موافقات، تعديلات، منشن، وبريفات د. مها هتوصلك على تليجرام فورًا. خطوة واحدة.</div></div></div>' +
    '<a class="btn pri" data-tglink="1" target="_blank" rel="noopener" href="' + href + '" style="width:100%;margin-top:10px;justify-content:center;text-decoration:none">📨 ربط تليجرام</a>' +
    '<div class="muted small" style="margin-top:8px">هيفتح تليجرام ← اضغط <b>Start</b> ← ارجع هنا هتلاقيه اتربط.</div></div>';
}
function bindPushBanner(v) {
  v.querySelectorAll('a[data-tglink]').forEach(a => a.addEventListener('click', e => {
    if (!_tgCode) { e.preventDefault(); toast('ثانية واحدة… جرّب تاني'); tgPrepareLink(); return; }
    _tgCode = null; tgStartPolling(); // code is single-use
  }));
  v.querySelectorAll('[data-pushtest]').forEach(b => b.onclick = sendTestPush);
  v.querySelectorAll('[data-tgunlink]').forEach(b => b.onclick = async () => {
    if (!confirm('فصل تليجرام؟ مش هتوصلك إشعارات هناك.')) return;
    await sb.rpc('hq_telegram_unlink'); await loadTgStatus(); toast('اتفصل');
  });
  bindWebPush(v);
}
function pushPill(id) {
  if (!S.tg || !S.tg[id]) return '';
  return S.tg[id].linked ? '<span class="pill okp">📨 تليجرام مربوط</span>' : '<span class="pill badp">🔕 تليجرام مش مربوط</span>';
}
async function sendTestPush() {
  toast('بنبعت إشعار تجريبي…');
  const { data, error } = await sb.functions.invoke('send-push', { body: { external_ids: [S.me.id], title: '🔔 إشعار تجريبي من Muhra HQ', body: 'تمام! الإشعارات شغالة.', url: HUB_URL } });
  if (error || !data) return toast('حصلت مشكلة، جرّب تاني', 3000);
  if (data.telegram) toast('✅ اتبعت على تليجرام', 3000);
  else if (data.webpush) toast('✅ اتبعت إشعار للمتصفح', 3000);
  else toast('مفيش جهاز مربوط. اربط تليجرام الأول', 3500);
}
function maybeAskPush() {
  if (!S.me) return;
  if (!S.tg) { loadTgStatus().then(() => S.tg && maybeAskPush()); return; }
  if (tgLinked()) return;
  const k = 'hq_tg_ask_' + S.me.id, last = +localStorage.getItem(k) || 0;
  if (Date.now() - last < 20 * 3600e3 || $('#sheetRoot').innerHTML) return;
  try { localStorage.setItem(k, String(Date.now())); } catch (e) {}
  const root = sheet('<div class="sh"><button class="btn ghost sm" onclick="closeSheet()">✕</button><b class="grow">📨 خطوة مهمة</b></div><div class="pad">' +
    '<p style="margin:0 0 12px">كل إشعارات الفريق بقت على تليجرام. اربط حسابك مرة واحدة وهتوصلك المهام والموافقات والمنشن فورًا.</p>' +
    pushBanner().replace('card pad pushcard', 'pushcard-in') + '<button class="btn" style="width:100%;margin-top:8px" onclick="closeSheet()">بعدين</button></div>');
  bindPushBanner(root);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.me && S.tg && !tgLinked()) loadTgStatus(); });
