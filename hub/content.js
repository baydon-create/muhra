'use strict';
/* Content pipeline: home, board, calendar, quick ideas, stats and the content card. */
/* ───────── VIEW: TODAY ───────── */
function viewHome(v) {
  const me = S.me.id, h = new Date().getHours();
  const openTasksN = S.tasks.filter(t => assigneesOf(t).includes(me) && t.status !== 'Done').length;
  const mine = S.items.filter(i => (i.owner === me || (i.helpers || []).includes(me)) && !['review', ...DONE_STAGES].includes(i.stage))
    .sort((a, b) => (a.due_date || a.publish_date || '9999').localeCompare(b.due_date || b.publish_date || '9999'));
  const changes = mine.filter(i => i.changes_note);
  const rest = mine.filter(i => !i.changes_note);
  const review = S.items.filter(i => i.stage === 'review');
  const waitingMine = S.items.filter(i => i.stage === 'review' && i.owner === me);
  const shown = new Set([...mine, ...(isApprover() ? review : []), ...waitingMine].map(i => i.id));
  const notReady = S.items.filter(i => !shown.has(i.id) && i.publish_date && dayDiff(i.publish_date) >= 0 && dayDiff(i.publish_date) <= 2 && !DONE_STAGES.includes(i.stage));
  const kpi = (v, l, cls, href, k) => '<a class="card kpi hk' + (cls ? ' ' + cls : '') + '" href="' + href + '"><span class="ki">' + ic(k, 17) + '</span><div class="v">' + v + '</div><div class="l">' + l + '</div></a>';
  let html = '<div class="kpis k4 homek">' +
    kpi(mine.length, 'محتوى عليك', '', '#/content', 'board') +
    kpi(openTasksN, 'مهام مفتوحة', 't-info', '#/tasks', 'tasks') +
    (isApprover() ? kpi(review.length, 'بانتظار موافقتك', review.length ? 'warnk' : 't-ok', '#/content', 'crown') : kpi(waitingMine.length, 'مستني الموافقة', waitingMine.length ? 'warnk' : 't-ok', '#/content', 'crown')) +
    kpi(notReady.length, 'نشر قريب ومش جاهز', notReady.length ? 'badk' : 't-ok', '#/calendar', 'cal') + '</div>';
  html += (typeof pushBanner === 'function' ? pushBanner() : '');
  html += weekStrip();
  if (isApprover()) {
    html += '<h2 class="sec">بانتظار موافقتك <span class="n">' + review.length + '</span></h2>';
    html += review.length ? '<div class="list">' + review.map(i => ccard(i, { noStage: true, extra: '<div class="row" style="margin-top:8px"><button class="btn ok sm" data-approve="' + i.id + '">موافقة</button><button class="btn bad sm" data-changes="' + i.id + '">تعديل</button><span class="muted small">' + esc(firstName(i.owner)) + '</span></div>' })).join('') + '</div>' : '<div class="empty">مفيش حاجة مستنية موافقتك ' + ic('x') + '</div>';
  }
  if (changes.length) html += '<h2 class="sec">تعديلات مطلوبة منك <span class="n">' + changes.length + '</span></h2><div class="list">' + changes.map(i => ccard(i, { extra: '<div class="alert warn" style="margin-top:7px;padding:7px 10px">' + esc(i.changes_note) + '</div>' })).join('') + '</div>';
  html += '<h2 class="sec">مطلوب منك <span class="n">' + rest.length + '</span></h2>';
  html += rest.length ? '<div class="list">' + rest.map(i => ccard(i)).join('') + '</div>' : '<div class="empty">مفيش محتوى عليك دلوقتي. خد فكرة من <a href="#/ideas">الأبحاث</a> أو اضغط <b>+</b></div>';
  if (waitingMine.length) html += '<h2 class="sec">مستني الموافقة <span class="n">' + waitingMine.length + '</span></h2><div class="list">' + waitingMine.map(i => ccard(i)).join('') + '</div>';
  if (notReady.length) html += '<h2 class="sec">نشره خلال يومين ولسه مش جاهز <span class="n">' + notReady.length + '</span></h2><div class="list">' + notReady.map(i => ccard(i)).join('') + '</div>';
  // Tasks, sign-offs and briefs live on the same home screen
  const myTasks = S.tasks.filter(t => assigneesOf(t).includes(me) && t.status !== 'Done')
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(a.deadline || '9999').localeCompare(String(b.deadline || '9999')));
  const toSign = S.tasks.filter(t => t.status === 'Done' && assigneesOf(t).includes(me) && !(t.signed_by || []).includes(me));
  const editReqs = isAdmin() ? S.tasks.filter(t => (t.edit_requests || []).some(r => dayDiff(String(r.created_at).slice(0, 10)) >= -7) && t.status !== 'Done') : [];
  const myBriefs = S.briefs.filter(b => (!b.assignees || !b.assignees.length || b.assignees.includes(me)) && dayDiff(String(b.created_at).slice(0, 10)) >= -3).slice(0, 4);
  if (myBriefs.length) html += '<h2 class="sec">بريفات جديدة <span class="n">' + myBriefs.length + '</span><a class="seeall" href="#/briefs">الكل ←</a></h2><div class="list">' + myBriefs.map(briefMini).join('') + '</div>';
  html += '<h2 class="sec">مهامي <span class="n">' + myTasks.length + '</span><a class="seeall" href="#/tasks">كل المهام ←</a></h2>';
  html += myTasks.length ? '<div class="list">' + myTasks.slice(0, 8).map(t => taskCard(t)).join('') + '</div>' : '<div class="empty">مفيش مهام مفتوحة عليك ' + ic('x') + '</div>';
  if (toSign.length) html += '<h2 class="sec">محتاجة توقيعك <span class="n">' + toSign.length + '</span></h2><div class="list">' + toSign.map(t => taskCard(t)).join('') + '</div>';
  if (editReqs.length) html += '<h2 class="sec">طلبات تعديل على المهام <span class="n">' + editReqs.length + '</span></h2><div class="list">' + editReqs.map(t => taskCard(t)).join('') + '</div>';
  v.innerHTML = html;
  if (typeof bindPushBanner === 'function') bindPushBanner(v);
  bindWeekStrip(v);
  v.querySelectorAll('[data-approve]').forEach(b => b.onclick = () => { const it = S.items.find(x => x.id === b.dataset.approve); if (it) moveStage(it, 'approved'); });
  v.querySelectorAll('[data-changes]').forEach(b => b.onclick = () => askChanges(S.items.find(x => x.id === b.dataset.changes)));
}
function weekStrip() {
  const t = today(); let cells = '';
  for (let d = 0; d < 7; d++) {
    const k = addDays(t, d), day = S.items.filter(i => i.publish_date === k), n = day.length, dt = new Date(k + 'T12:00:00');
    cells += '<div class="wd ' + (n ? '' : 'gap ') + (d === 0 ? 'today' : '') + '" data-day="' + k + '"><div class="d">' + AR_DAYS[dt.getDay()].replace('ال', '') + '</div><div class="n">' + dt.getDate() + '</div><div class="c">' + (n ? n + ' منشور' : 'فاضي') + '</div><div class="pips">' + day.slice(0, 4).map(i => '<i style="background:var(--s-' + (SM[i.stage] ? i.stage : 'idea') + ')"></i>').join('') + '</div></div>';
  }
  return '<div class="week">' + cells + '</div>';
}
function bindWeekStrip(v) { v.querySelectorAll('[data-day]').forEach(el => el.onclick = () => { S.calStart = weekStart(el.dataset.day); go('calendar'); setTimeout(() => { const t = document.getElementById('day-' + el.dataset.day); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50); }); }

/* ───────── VIEW: BOARD ─────────
   Two views of one pipeline. The board shows the working stages plus one "ready" column,
   each column scrolls on its own so the page never grows. Published items live in the list,
   filtered by period and paged, so hundreds of old posts never load into the board. */
const BOARD_COLS = [
  { k: 'idea', n: 'فكرة', st: ['idea'] }, { k: 'script', n: 'سكريبت', st: ['script'] }, { k: 'shoot', n: 'تصوير', st: ['shoot'] },
  { k: 'edit', n: 'مونتاج', st: ['edit'] }, { k: 'review', n: 'مراجعة', st: ['review'] }, { k: 'ready', n: 'جاهز للنشر', st: ['approved', 'scheduled'] }
];
const LIST_TABS = [
  { k: 'active', n: 'شغال', st: ['idea', 'script', 'shoot', 'edit', 'review'] }, { k: 'ready', n: 'جاهز للنشر', st: ['approved', 'scheduled'] },
  { k: 'posted', n: 'منشور', st: ['posted'] }, { k: 'all', n: 'الكل', st: null }
];
const PERIODS = [[7, 'آخر 7 أيام'], [30, 'آخر 30 يوم'], [90, 'آخر 90 يوم'], [0, 'كل الوقت']];
const postedDay = i => String(i.posted_at || i.publish_date || i.created_at || '').slice(0, 10);
function inPeriod(i, days) { return !days || i.stage !== 'posted' || dayDiff(postedDay(i)) >= -days; }

function viewBoard(v) {
  const f = S.board;
  const wide = window.innerWidth >= 1000;
  const view = wide ? f.view : 'list';
  const pool = S.items.filter(i => (!f.mine || i.owner === S.me.id || (i.helpers || []).includes(S.me.id)) && (!f.type || i.type === f.type) && (!f.src || (f.src === 'shoot' ? !!i.shoot_id : !i.shoot_id)));
  const posted = pool.filter(i => i.stage === 'posted' && inPeriod(i, f.period || 30));
  let html = '<div class="toolbar ptool">' +
    (wide ? '<div class="seg" role="tablist"><button class="' + (view === 'board' ? 'on' : '') + '" data-view="board">' + ic('board') + 'لوحة</button><button class="' + (view === 'list' ? 'on' : '') + '" data-view="list">' + ic('tasks') + 'قائمة</button></div>' : '') +
    '<div class="seg"><button class="' + (f.mine ? '' : 'on') + '" data-mine="0">الكل</button><button class="' + (f.mine ? 'on' : '') + '" data-mine="1">شغلي</button></div>' +
    '<select class="mini" id="typeF"><option value="">كل الأنواع</option>' + Object.entries(TYPES).map(([k, n]) => '<option value="' + k + '"' + (f.type === k ? ' selected' : '') + '>' + n + '</option>').join('') + '</select>' +
    '<select class="mini" id="srcF" aria-label="المصدر"><option value="">عادي + تصوير</option><option value="regular"' + (f.src === 'regular' ? ' selected' : '') + '>محتوى عادي</option><option value="shoot"' + (f.src === 'shoot' ? ' selected' : '') + '>من خطط التصوير</option></select>' +
    '<span class="muted small ptool-sum">' + pool.filter(i => !DONE_STAGES.includes(i.stage)).length + ' شغال · <span' + (pool.some(isLate) ? ' class="late-n"' : '') + '>' + pool.filter(isLate).length + ' متأخر</span></span></div>';

  if (view === 'board') {
    html += '<button class="postedbar" data-golist="posted">' + ic('ads') + '<span>منشور</span><b>' + posted.length + '</b><span class="muted">في آخر ' + (f.period || 30) + ' يوم</span><span class="grow"></span><span class="seeall">عرض في القائمة ←</span></button>';
    html += '<div class="kanban fit">' + BOARD_COLS.map(c => {
      const col = sortCol(pool.filter(i => c.st.includes(i.stage)), c.k);
      return '<section class="kcol" style="--c:var(--s-' + (c.k === 'ready' ? 'approved' : c.k) + ')"><h3><span>' + c.n + '</span><span class="kn">' + col.length + '</span></h3><div class="kbody">' +
        (col.map(i => ccard(i, { compact: true, noStage: c.k !== 'ready' })).join('') || '<div class="kempty">لا يوجد</div>') + '</div></section>';
    }).join('') + '</div>';
  } else {
    const tab = LIST_TABS.find(t => t.k === f.lstage) || LIST_TABS[0];
    const count = t => pool.filter(i => (!t.st || t.st.includes(i.stage)) && inPeriod(i, f.period)).length;
    html += '<div class="ltabs">' + LIST_TABS.map(t => '<button class="' + (t.k === tab.k ? 'on' : '') + '" data-lstage="' + t.k + '">' + t.n + ' <span class="c">' + count(t) + '</span></button>').join('') +
      '<span class="grow"></span>' + ((tab.k === 'posted' || tab.k === 'all') ? '<select class="mini" id="periodF">' + PERIODS.map(([d, n]) => '<option value="' + d + '"' + (+f.period === d ? ' selected' : '') + '>' + n + '</option>').join('') + '</select>' : '') + '</div>';
    let rows = pool.filter(i => (!tab.st || tab.st.includes(i.stage)) && inPeriod(i, f.period));
    const key = { title: i => i.title || '', stage: i => SI[i.stage], type: i => i.type || '', owner: i => firstName(i.owner) || '', date: i => (i.stage === 'posted' ? postedDay(i) : (i.publish_date || i.due_date || '9999')) };
    const kf = key[f.sort] || key.date;
    rows.sort((a, b) => { const x = kf(a), y = kf(b); return (x > y ? 1 : x < y ? -1 : 0) * f.dir; });
    const total = rows.length; rows = rows.slice(0, f.limit);
    const th = (k, n, cls) => '<th class="' + (cls || '') + '"><button data-sort="' + k + '" class="' + (f.sort === k ? 'on' : '') + '">' + n + (f.sort === k ? (f.dir > 0 ? ' ↓' : ' ↑') : '') + '</button></th>';
    if (!total) html += '<div class="empty">مفيش محتوى هنا</div>';
    else if (wide) {
      html += '<div class="card ptable"><table class="tb"><thead><tr>' + th('title', 'العنوان') + th('stage', 'المرحلة') + th('type', 'النوع') + th('owner', 'المسؤول') + th('date', tab.k === 'posted' ? 'اتنشر' : 'النشر', 'dcol') + '</tr></thead><tbody>' +
        rows.map(i => '<tr data-open="' + i.id + '"' + (isLate(i) ? ' class="is-late"' : '') + '><td class="tt"><bdi>' + esc(i.title) + '</bdi>' + (isLate(i) ? ' <span class="pill late">متأخر</span>' : '') + (i.changes_note && !DONE_STAGES.includes(i.stage) ? ' <span class="pill soon">تعديلات</span>' : '') + '</td><td>' + stageTag(i.stage) + '</td><td class="muted">' + typeIc(i.type) + ' ' + (TYPES[i.type] || '') + '</td><td>' + (i.owner ? '<span class="who">' + av(i.owner) + esc(firstName(i.owner)) + '</span>' : '<span class="muted">—</span>') + '</td><td class="dcol">' + (kf(i) && kf(i) !== '9999' ? fmtShort(kf(i)) : '<span class="muted">—</span>') + '</td></tr>').join('') +
        '</tbody></table></div>';
    } else html += '<div class="list">' + rows.map(i => ccard(i)).join('') + '</div>';
    if (total > rows.length) html += '<button class="btn more" id="moreRows">عرض المزيد · ' + (total - rows.length) + ' باقي</button>';
  }
  v.innerHTML = html;
  v.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { f.view = b.dataset.view; lsS('hq.boardView', f.view); renderAll(); });
  v.querySelectorAll('[data-mine]').forEach(b => b.onclick = () => { f.mine = b.dataset.mine === '1'; f.limit = 50; renderAll(); });
  v.querySelectorAll('[data-lstage]').forEach(b => b.onclick = () => { f.lstage = b.dataset.lstage; f.limit = 50; if (f.lstage === 'posted') { f.sort = 'date'; f.dir = -1; } else if (f.sort === 'date') f.dir = 1; renderAll(); });
  v.querySelectorAll('[data-golist]').forEach(b => b.onclick = () => { f.view = 'list'; f.lstage = 'posted'; f.sort = 'date'; f.dir = -1; f.limit = 50; lsS('hq.boardView', 'list'); renderAll(); });
  v.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => { const k = b.dataset.sort; f.dir = f.sort === k ? -f.dir : 1; f.sort = k; renderAll(); });
  const pf = $('#periodF'); if (pf) pf.onchange = e => { f.period = +e.target.value; f.limit = 50; renderAll(); };
  const mr = $('#moreRows'); if (mr) mr.onclick = () => { f.limit += 50; renderAll(); };
  $('#typeF').onchange = e => { f.type = e.target.value; f.limit = 50; renderAll(); };
  $('#srcF').onchange = e => { f.src = e.target.value; f.limit = 50; renderAll(); };
}
function sortCol(arr, stage) {
  if (stage === 'posted') return arr.sort((a, b) => (b.posted_at || '').localeCompare(a.posted_at || '')).slice(0, 40);
  return arr.sort((a, b) => (a.publish_date || a.due_date || '9999').localeCompare(b.publish_date || b.due_date || '9999'));
}

/* ───────── VIEW: CALENDAR ───────── */
function viewCal(v) {
  if (!S.calStart) S.calStart = weekStart(today());
  if (S.publish === null && !S._pubLoading) { S._pubLoading = true; loadPublish().then(renderAll); }
  const st = S.calStart, end = addDays(st, 6);
  let html = '<div class="toolbar"><button class="btn sm" id="prevW">→ السابق</button><b class="grow" style="text-align:center">' + fmtShort(st) + ' – ' + fmtShort(end) + '</b><button class="btn sm" id="nextW">التالي ←</button></div>';
  html += '<div class="toolbar"><button class="btn sm ghost" id="thisW">هذا الأسبوع</button><span class="muted small" style="margin-inline-start:auto">' + S.items.filter(i => i.publish_date >= st && i.publish_date <= end).length + ' منشور مخطط</span></div>';
  for (let d = 0; d < 7; d++) {
    const k = addDays(st, d), list = S.items.filter(i => i.publish_date === k), past = dayDiff(k) < 0;
    html += '<div class="card calday ' + (!list.length && !past ? 'gap' : '') + '" id="day-' + k + '"><div class="hd"><b>' + fmtDay(k) + '</b>' + (k === today() ? '<span class="pill okp">النهارده</span>' : '') +
      publishChips(k) + (S.shoots || []).filter(s => s.shoot_date === k && s.stage !== 'done').map(s => '<button class="pill shtag" data-calshoot="' + s.id + '">' + ic('camera', 13) + ' تصوير: ' + esc(s.title) + '</button>').join('') + '<span class="grow"></span>' + (!list.length && !past ? '<span class="small" style="color:var(--bad);font-weight:700">مفيش محتوى</span>' : '') + (past ? '' : '<button class="btn sm" data-addday="' + k + '">+ إضافة</button>') + '</div>' +
      (list.length ? '<div class="bd">' + list.map(i => ccard(i)).join('') + '</div>' : '') + '</div>';
  }
  const unsched = S.items.filter(i => !i.publish_date && !['posted'].includes(i.stage));
  if (unsched.length) html += '<h2 class="sec">بدون موعد نشر <span class="n">' + unsched.length + '</span></h2><div class="list">' + unsched.map(i => ccard(i)).join('') + '</div>';
  v.innerHTML = html;
  $('#prevW').onclick = () => { S.calStart = addDays(st, -7); renderAll(); };
  $('#nextW').onclick = () => { S.calStart = addDays(st, 7); renderAll(); };
  $('#thisW').onclick = () => { S.calStart = weekStart(today()); renderAll(); };
  v.querySelectorAll('[data-addday]').forEach(b => b.onclick = () => newItem({ publish_date: b.dataset.addday }));
  v.querySelectorAll('[data-calshoot]').forEach(b => b.onclick = () => openShoot(b.dataset.calshoot));
}

/* ───────── VIEW: RESEARCH ───────── */
async function loadResearch() {
  const r = S.research; r.loading = true; renderAll();
  const { data, error } = await sb.rpc('hq_top_competitor_posts', { p_days: r.days, p_limit: 40, p_format: r.format || null, p_kind: r.kind || null });
  r.loading = false; r.rows = error ? [] : (data || []); if (error) { console.error(error); toast('تعذر تحميل الأبحاث'); }
  renderAll();
}
function viewResearch(v) {
  const r = S.research;
  if (!r.rows && !r.loading) { loadResearch(); }
  const saved = new Set(S.items.map(i => i.ref_url).filter(Boolean));
  let html = '<div class="card pad" style="margin-bottom:12px"><div style="font-weight:800">أفضل محتوى المنافسين</div><div class="muted small">مرتب حسب نسبة التفاعل، من Competitor Intel. اضغط «حفظ كفكرة» عشان يدخل خط المحتوى.</div></div>';
  html += '<div class="chips">' + [['competitor', 'البراندات'], ['creator', 'الكريتورز']].map(([k, n]) => '<button class="chip ' + (r.kind === k ? 'on' : '') + '" data-kind="' + k + '">' + n + '</button>').join('') +
    [['', 'كل الأنواع'], ['Reel', 'ريلز'], ['Carousel', 'كاروسيل'], ['Image', 'صور']].map(([k, n]) => '<button class="chip ' + (r.format === k ? 'on' : '') + '" data-fmt="' + k + '">' + n + '</button>').join('') +
    [7, 14, 30].map(d => '<button class="chip ' + (r.days === d ? 'on' : '') + '" data-days="' + d + '">' + d + ' يوم</button>').join('') + '</div>';
  html += '<div class="linkrow" style="margin:4px 0 14px"><input class="inp" id="refLink" placeholder="الصق رابط فكرة (إنستجرام / تيك توك / Adlumi)"><button class="btn pri" id="refAdd">حفظ</button></div>';
  if (r.loading || !r.rows) html += '<div class="empty">جاري التحميل…</div>';
  else if (!r.rows.length) html += '<div class="empty">مفيش بوستات في الفترة دي</div>';
  else html += '<div class="rgrid">' + r.rows.map((p, idx) => {
    const isSaved = saved.has(p.permalink);
    return '<div class="card rcard"><div class="img" data-img="' + esc(p.thumb || '') + '"><span class="fmt">' + esc(p.format || '') + '</span>' + (p.er != null ? '<span class="er">' + Number(p.er).toFixed(1) + '%</span>' : '') + '</div>' +
      '<div class="bd"><div class="u">@' + esc(p.username) + '</div><div class="cap">' + esc(p.caption || '') + '</div><div class="st"><span>' + ic('heart') + ' ' + num(p.likes) + '</span><span>' + ic('msg') + ' ' + num(p.comments) + '</span>' + (p.views ? '<span>' + ic('play') + ' ' + num(p.views) + '</span>' : '') + '</div>' +
      '<div class="row"><a class="btn sm grow" href="' + esc(safeUrl(p.permalink)) + '" target="_blank" rel="noopener">فتح</a><button class="btn sm grow ' + (isSaved ? '' : 'pri') + '" data-save="' + idx + '"' + (isSaved ? ' disabled' : '') + '>' + (isSaved ? 'محفوظ ' + ic('check') : 'حفظ كفكرة') + '</button></div><button class="btn sm ghost" data-toshoot="' + idx + '">' + ic('camera', 14) + ' لخطة تصوير</button></div></div>';
  }).join('') + '</div>';
  html += '<div class="row wrap" style="margin-top:16px"><a class="btn" href="#/intel">Competitor Intel كامل</a><a class="btn" href="#/ads">إعلانات Adlumi</a></div>';
  v.innerHTML = html;
  v.querySelectorAll('[data-img]').forEach(el => { const u = el.dataset.img; if (!u) return; const im = new Image(); im.onload = () => { el.style.backgroundImage = 'url("' + u.replace(/"/g, '%22') + '")'; }; im.src = u; });
  v.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { r.kind = b.dataset.kind; r.rows = null; loadResearch(); });
  v.querySelectorAll('[data-fmt]').forEach(b => b.onclick = () => { r.format = b.dataset.fmt; r.rows = null; loadResearch(); });
  v.querySelectorAll('[data-days]').forEach(b => b.onclick = () => { r.days = +b.dataset.days; r.rows = null; loadResearch(); });
  v.querySelectorAll('[data-save]').forEach(b => b.onclick = async () => {
    const p = r.rows[+b.dataset.save]; b.disabled = true;
    await createItem({ title: 'فكرة من @' + p.username + (p.format === 'Reel' ? ' (ريل)' : ''), type: p.format === 'Reel' ? 'reel' : p.format === 'Carousel' ? 'carousel' : 'post', ref_url: p.permalink, ref_thumb: p.thumb, ref_source: '@' + p.username, brief: p.caption ? 'الكابشن الأصلي:\n' + p.caption : null }, { open: false });
    toast('اتحفظت في «فكرة»');
  });
  v.querySelectorAll('[data-toshoot]').forEach(b => b.onclick = () => {
    const p = r.rows[+b.dataset.toshoot];
    chooseShoot('أضف المرجع لخطة تصوير', async sh => { if (sh && await shootPatch(sh, 'ideas', 'add', { title: 'مرجع من @' + p.username, url: p.permalink, note: (p.caption || '').slice(0, 300) })) toast('اتضاف لأفكار «' + sh.title + '»'); });
  });
  $('#refAdd').onclick = async () => {
    const u = safeUrl($('#refLink').value.trim()); if (!u) return toast('الصق رابط صحيح');
    const host = new URL(u).hostname.replace('www.', '');
    previewFor(u);
    await createItem({ title: 'فكرة من ' + host, type: /tiktok/.test(host) ? 'tiktok' : 'reel', ref_url: u, ref_source: host });
  };
}

/* ───────── VIEW: PERFORMANCE ───────── */
async function loadStats() {
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const [{ data: st }, { data: act }] = await Promise.all([
    sb.rpc('hq_own_stats', { p_days: 7 }),
    sb.from('hq_activity').select('item_id,actor,action,to_stage,created_at').gte('created_at', since).limit(2000)
  ]);
  S.stats = (st && st[0]) || null; S.activity = act || []; renderAll();
}
function viewStats(v) {
  if (S.stats === null && !S._statsLoading) { S._statsLoading = true; loadStats(); }
  const ws = weekStart(today()), we = addDays(ws, 6);
  const planned = S.items.filter(i => i.publish_date >= ws && i.publish_date <= we);
  const postedWeek = S.items.filter(i => i.posted_at && isoDate(new Date(i.posted_at)) >= ws);
  const late = S.items.filter(isLate);
  const review = S.items.filter(i => i.stage === 'review');
  const st = S.stats;
  let html = '';
  html += '<h2 class="sec" style="margin-top:4px">هذا الأسبوع (من السبت)</h2><div class="kpis">' +
    kpi(postedWeek.length + ' / ' + planned.length, 'منشور / مخطط') + kpi(review.length, 'بانتظار موافقة') + kpi(late.length, 'متأخر', late.length ? 'var(--bad)' : '') +
    kpi(S.items.filter(i => i.stage === 'idea').length, 'أفكار في البنك') + '</div>';
  html += '<h2 class="sec">إنستجرام @muhra.egy — آخر 7 أيام</h2>';
  html += st ? '<div class="kpis">' + kpi(st.posts + ' (' + st.reels + ' ريل)', 'بوستات') + kpi(num(st.views), 'مشاهدات') + kpi(num(st.reach), 'وصول') + kpi(num(st.saved) + ' / ' + num(st.shares), 'حفظ / مشاركة') + kpi(num(st.followers), 'متابعين') + '</div>' : '<div class="empty">جاري التحميل…</div>';
  // per person
  const rows = S.team.map(m => {
    const own = S.items.filter(i => i.owner === m.id);
    const done = S.activity.filter(a => a.actor === m.id && a.action === 'stage').length;
    const finished = own.filter(i => i.posted_at && isoDate(new Date(i.posted_at)) >= ws).length + own.filter(i => i.approved_at && isoDate(new Date(i.approved_at)) >= ws && i.stage !== 'posted').length;
    const tOwn = S.tasks.filter(t => assigneesOf(t).includes(m.id));
    return { m, open: own.filter(i => !DONE_STAGES.includes(i.stage)).length + tOwn.filter(t => t.status !== 'Done').length, late: own.filter(isLate).length + tOwn.filter(t => t.status !== 'Done' && t.deadline && new Date(t.deadline) < new Date()).length, moves: done, finished: finished + tOwn.filter(t => t.status === 'Done' && t.created_at && isoDate(new Date(t.created_at)) >= ws).length };
  });
  html += '<h2 class="sec">الفريق هذا الأسبوع</h2><div class="card" style="overflow-x:auto"><table class="tb"><tr><th>الشخص</th><th>مفتوح</th><th>متأخر</th><th>خلص/اعتمد</th><th>تحديثات</th></tr>' +
    rows.map(r => '<tr><td><div class="row">' + av(r.m.id) + esc(firstName(r.m.id)) + '</div></td><td class="num">' + r.open + '</td><td class="num" style="' + (r.late ? 'color:var(--bad)' : '') + '">' + r.late + '</td><td class="num">' + r.finished + '</td><td class="num">' + r.moves + '</td></tr>').join('') + '</table></div>';
  // tasks this week
  const tDone = S.tasks.filter(t => t.status === 'Done').length, tOpen = S.tasks.filter(t => t.status !== 'Done').length;
  const tLate = S.tasks.filter(t => t.status !== 'Done' && t.deadline && new Date(t.deadline) < new Date()).length;
  html += '<h2 class="sec">المهام</h2><div class="kpis">' + kpi(tOpen, 'مفتوحة') + kpi(tLate, 'متأخرة', tLate ? 'var(--bad)' : '') + kpi(tDone, 'خلصت') + kpi(S.briefs.filter(b => dayDiff(String(b.created_at).slice(0, 10)) >= -7).length, 'بريفات الأسبوع') + '</div>';
  v.innerHTML = html;
}
const kpi = (val, label, color) => '<div class="card kpi"><div class="v" style="' + (color ? 'color:' + color : '') + '">' + esc(val) + '</div><div class="l">' + esc(label) + '</div></div>';

/* ───────── CREATE ───────── */
async function createItem(fields, opts = { open: true }) {
  const row = Object.assign({ title: 'محتوى جديد', type: 'reel', stage: 'idea', owner: S.me.id, created_by: S.me.id, platforms: ['instagram'] }, fields);
  const { data, error } = await sb.from('hq_content').insert(row).select().single();
  if (error) { toast('تعذر الإنشاء'); console.error(error); return null; }
  S.items.unshift(data);
  logAct(data.id, 'created', null, data.stage);
  if (data.owner && data.owner !== S.me.id) push([data.owner], '📌 محتوى جديد عليك', data.title);
  renderAll();
  if (opts.open !== false) openItem(data.id, true);
  return data;
}
function newItem(pre = {}) {
  const root = $('#sheetRoot');
  root.innerHTML = '<div class="overlay" id="ov"><div class="sheet"><div class="sh"><b class="grow">محتوى جديد</b><button class="btn ghost sm" id="x">' + ic('x') + '</button></div><div class="sb">' +
    '<label class="lb">العنوان</label><input class="inp" id="nTitle" value="' + esc(pre.title || '') + '" placeholder="مثال: ريل تنسيق فستان السهرة البيج" autofocus>' +
    '<label class="lb">المنتجات (من Shopify)</label><div id="nProds" class="plinks"></div><button class="btn sm" id="nProdBtn" type="button" style="margin-top:6px">+ اختار منتج</button>' +
    '<label class="lb">النوع</label><div class="toggles" id="nType">' + Object.entries(TYPES).map(([k, n], i) => '<button class="tg ' + ((pre.type || 'reel') === k ? 'on' : '') + '" data-v="' + k + '">' + typeIc(k) + ' ' + n + '</button>').join('') + '</div>' +
    '<div class="g2"><div><label class="lb">المسؤول</label><select class="inp" id="nOwner">' + S.team.map(m => '<option value="' + m.id + '"' + (m.id === S.me.id ? ' selected' : '') + '>' + esc(m.name) + '</option>').join('') + '</select></div>' +
    '<div><label class="lb">المرحلة</label><select class="inp" id="nStage">' + STAGES.slice(0, 5).map(s => '<option value="' + s.k + '">' + s.n + '</option>').join('') + '</select></div>' +
    '<div><label class="lb">التسليم قبل</label><input type="date" class="inp" id="nDue"></div><div><label class="lb">موعد النشر</label><input type="date" class="inp" id="nPub" value="' + esc(pre.publish_date || '') + '"></div></div>' +
    '<label class="lb">البريف / الفكرة (اختياري)</label><textarea class="inp" id="nBrief" placeholder="إيه الهدف؟ مين الجمهور؟ أي منتج؟"></textarea>' +
    '</div><div class="sf"><button class="btn pri" id="nSave">إنشاء</button></div></div></div>';
  let type = pre.type || 'reel', prodIds = [...(pre.product_ids || [])];
  const drawProds = () => { $('#nProds').innerHTML = prodIds.map(id => { const p = prod(id); return p ? '<div class="plink"><span class="pth" style="background-image:url(\'' + esc(shopImg(p.image, 160) || '') + '\')"></span><span class="grow plt"><b dir="auto">' + esc(p.title) + '</b><span class="muted small">' + esc(prodPrice(p)) + '</span></span></div>' : ''; }).join(''); };
  drawProds();
  $('#nProdBtn').onclick = async () => { const ids = await pickProducts(prodIds, 'المحتوى ده عن أي منتج؟'); if (ids === null) return; prodIds = ids; drawProds(); const t = $('#nTitle'); if (t && !t.value.trim() && ids[0] && prod(ids[0])) t.value = prod(ids[0]).title; };
  root.querySelectorAll('#nType .tg').forEach(b => b.onclick = () => { type = b.dataset.v; root.querySelectorAll('#nType .tg').forEach(x => x.classList.toggle('on', x === b)); });
  const close = () => root.innerHTML = '';
  $('#x').onclick = close; $('#ov').onclick = e => { if (e.target.id === 'ov') close(); };
  $('#nSave').onclick = async () => {
    const title = $('#nTitle').value.trim(); if (!title) { $('#nTitle').focus(); return toast('اكتب عنوان'); }
    $('#nSave').disabled = true;
    const f = { title, type, owner: $('#nOwner').value, stage: $('#nStage').value, due_date: $('#nDue').value || null, publish_date: $('#nPub').value || null, brief: $('#nBrief').value.trim() || null, product_ids: prodIds };
    if (prodIds.length && prod(prodIds[0])) f.product = prod(prodIds[0]).title;
    if (type === 'tiktok') f.platforms = ['tiktok'];
    close(); await createItem(f, { open: false }); toast('تم الإنشاء');
  };
  setTimeout(() => $('#nTitle') && $('#nTitle').focus(), 80);
}

/* ───────── ITEM SHEET ───────── */
async function openItem(id, fresh) {
  const it = S.items.find(x => x.id === id);
  if (!it) { const { data } = await sb.from('hq_content').select('*').eq('id', id).maybeSingle(); if (!data) return toast('المحتوى غير موجود'); S.items.unshift(data); return openItem(id); }
  S.openId = id;
  if (location.hash !== '#item=' + id) history.replaceState(null, '', '#item=' + id);
  renderSheet(it);
  loadThread(id);
}
function renderSheet(it) {
  const root = $('#sheetRoot'), idx = SI[it.stage] ?? 0;
  const canEdit = true;
  const fld = (label, key, ph, rows) => '<label class="lb">' + label + '</label><textarea dir="auto" class="inp" data-f="' + key + '" rows="' + (rows || 3) + '" placeholder="' + esc(ph || '') + '">' + esc(it[key] || '') + '</textarea>';
  const link = (label, key, ph) => {
    const u = safeUrl(it[key] || '');
    return '<label class="lb">' + label + '</label><div class="linkrow"><input class="inp" data-f="' + key + '" value="' + esc(it[key] || '') + '" placeholder="' + esc(ph) + '">' + (u ? '<a class="btn" href="' + esc(u) + '" target="_blank" rel="noopener">فتح</a>' : '') + '</div>';
  };
  let alert = '';
  if (it.changes_note && it.stage !== 'approved') alert = '<div class="alert warn"><b>تعديلات مطلوبة:</b> ' + esc(it.changes_note) + '</div>';
  if (it.stage === 'approved' && it.approved_by) alert = '<div class="alert ok">اعتمده ' + esc(firstName(it.approved_by)) + (it.approved_at ? ' · ' + fmtTime(it.approved_at) : '') + ' — ارفعه على Drive للنشر التلقائي أو جدوله.</div>';
  if (isLate(it)) alert += '<div class="alert bad">متأخر عن الموعد</div>';
  if (it.publish_folder_id) alert += '<div class="alert ' + (it.stage === 'posted' ? 'ok' : 'warn') + '">' + ic('folder') + ' ' + (it.stage === 'posted' ? 'اتنشر من طابور النشر التلقائي' : 'في طابور النشر التلقائي' + (it.publish_date ? ' ليوم ' + esc(fmtDay(it.publish_date)) : '') + ' — معتمد ومستني النشر') +
    ' · <a href="https://drive.google.com/drive/folders/' + encodeURIComponent(it.publish_folder_id) + '" target="_blank" rel="noopener">فتح الفولدر</a></div>';
  root.innerHTML = '<div class="overlay" id="ov"><div class="sheet"><div class="sh">' + stageTag(it.stage) + '<span class="pill">' + typeIc(it.type) + ' ' + TYPES[it.type] + '</span><span class="grow"></span>' +
    '<button class="btn ghost sm" id="copyLink" title="نسخ الرابط">' + ic('link') + '</button><button class="btn ghost sm" id="x">' + ic('x') + '</button></div><div class="sb">' +
    '<input dir="auto" class="titleinp" data-f="title" value="' + esc(it.title) + '">' +
    '<div class="stepper">' + STAGES.map((s, i) => '<button data-step="' + s.k + '" class="' + (i < idx ? 'done' : i === idx ? 'cur' : '') + '">' + s.n + '</button>').join('') + '</div>' + alert +
    '<details class="cdet"' + (it.stage === 'idea' ? ' open' : '') + '><summary><span>تفاصيل الكارت</span><span class="muted small">' + esc(firstName(it.owner)) + (it.publish_date ? ' · نشر ' + fmtDay(it.publish_date) : '') + '</span></summary>' +
    '<div class="g2"><div><label class="lb">المسؤول</label><select class="inp" data-f="owner">' + S.team.map(m => '<option value="' + m.id + '"' + (m.id === it.owner ? ' selected' : '') + '>' + esc(m.name) + '</option>').join('') + '</select></div>' +
    '<div><label class="lb">النوع</label><select class="inp" data-f="type">' + Object.entries(TYPES).map(([k, n]) => '<option value="' + k + '"' + (k === it.type ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>' +
    '<div><label class="lb">التسليم قبل</label><input type="date" class="inp" data-f="due_date" value="' + esc(it.due_date || '') + '"></div>' +
    '<div><label class="lb">موعد النشر</label><input type="date" class="inp" data-f="publish_date" value="' + esc(it.publish_date || '') + '"></div></div>' +
    '<label class="lb">مساعدين</label><div class="toggles" id="helpers">' + S.team.filter(m => m.id !== it.owner).map(m => '<button class="tg ' + ((it.helpers || []).includes(m.id) ? 'on' : '') + '" data-h="' + m.id + '">' + av(m.id) + esc(firstName(m.id)) + '</button>').join('') + '</div>' +
    '<label class="lb">المنصات</label><div class="toggles" id="plats">' + Object.entries(PLATFORMS).map(([k, n]) => '<button class="tg ' + ((it.platforms || []).includes(k) ? 'on' : '') + '" data-p="' + k + '">' + n + '</button>').join('') + '</div>' +
    '<div class="g2"><div><label class="lb">المحور</label><select class="inp" data-f="pillar"><option value="">—</option>' + PILLARS.map(p => '<option' + (p === it.pillar ? ' selected' : '') + '>' + esc(p) + '</option>').join('') + '</select></div>' +
    '<div><label class="lb">المنتج / الكوليكشن</label><input class="inp" data-f="product" value="' + esc(it.product || '') + '" placeholder="مثال: Formal"></div></div>' +
    '</details>' +
    productsBlock(it.product_ids, 'item:' + it.id) +
    footageBlock(it) +
    stageWorkspace(it) +
    linkedTasksBlock(it) +
    '<div class="sectitle">التعليقات</div><div id="thread"><div class="muted small">…</div></div>' +
    '<div class="linkrow" style="margin-top:8px"><textarea dir="auto" class="inp" id="cText" rows="1" placeholder="اكتب تعليق… (اذكر الشخص بـ @)" style="min-height:44px"></textarea><button class="btn pri" id="cSend">إرسال</button></div>' +
    '<div class="sectitle">السجل</div><div id="acts" class="small"></div>' +
    ((isAdmin() || it.created_by === S.me.id) ? '<div style="margin-top:22px"><button class="btn bad sm" id="archive">أرشفة</button></div>' : '') +
    '</div><div class="sf" id="actions">' + actionButtons(it) + (it.stage === 'idea' && !it.shoot_id ? '<button class="btn" data-act="toshoot">' + ic('camera', 15) + ' لخطة تصوير</button>' : '') + '</div></div></div>';

  $('#x').onclick = closeSheet;
  $('#ov').onclick = e => { if (e.target.id === 'ov') closeSheet(); };
  $('#copyLink').onclick = () => { const u = location.origin + location.pathname + '#item=' + it.id; navigator.clipboard ? navigator.clipboard.writeText(u).then(() => toast('تم نسخ الرابط')) : prompt('الرابط', u); };
  root.querySelectorAll('[data-f]').forEach(el => {
    el.addEventListener('change', async () => {
      const k = el.dataset.f; let val = el.value.trim();
      if (k === 'title' && !val) { el.value = it.title; return; }
      val = val === '' ? null : val;
      if ((it[k] || null) === val) return;
      const prevOwner = it.owner;
      if (k === 'ref_url' && val && !safeUrl(val)) { el.value = it.ref_url || ''; return toast('الصق رابط صحيح يبدأ بـ https://'); }
      await updateItem(it.id, k === 'ref_url' ? { ref_url: val, ref_thumb: null, ref_source: null } : { [k]: val });
      if (k === 'ref_url' && val) previewFor(val);
      if (k === 'owner' && val && val !== prevOwner) { push([val], '📌 محتوى جديد عليك', it.title); logAct(it.id, 'owner', null, null, nameOf(val)); renderSheet(it); loadThread(it.id); }
      if (['type', 'ref_url', 'post_url', 'drive_link'].includes(k)) { renderSheet(it); loadThread(it.id); }
      renderAllBg();
    });
  });
  const cap = root.querySelector('[data-f="caption"]'); if (cap) cap.addEventListener('input', () => { $('#capCount').textContent = cap.value.length + ' / 2200'; });
  root.querySelectorAll('[data-step]').forEach(b => b.onclick = () => {
    const to = b.dataset.step; if (to === it.stage) return;
    if (to === 'approved' && !isApprover()) return toast('الموافقة لـ ' + approverNames() + ' فقط');
    if (SI[to] > SI.review && SI[it.stage] < SI.approved && !isApprover()) return toast('لازم يتعمل موافقة الأول');
    if (to === 'review') return sendToReview(it);
    moveStage(it, to).then(() => { renderSheet(it); loadThread(it.id); });
  });
  root.querySelectorAll('#helpers [data-h]').forEach(b => b.onclick = async () => {
    const id = b.dataset.h, h = new Set(it.helpers || []); h.has(id) ? h.delete(id) : h.add(id);
    b.classList.toggle('on'); await updateItem(it.id, { helpers: [...h] }, true); if (h.has(id)) push([id], '🤝 اتضفت كمساعد', it.title); renderAllBg();
  });
  root.querySelectorAll('#plats [data-p]').forEach(b => b.onclick = async () => {
    const p = new Set(it.platforms || []); p.has(b.dataset.p) ? p.delete(b.dataset.p) : p.add(b.dataset.p);
    b.classList.toggle('on'); await updateItem(it.id, { platforms: [...p] }, true);
  });
  bindStageWorkspace(it);
  bindFootage(it);
  bindProductsBlock(root, () => { const sc = $('#sheetRoot .sb'), top = sc ? sc.scrollTop : 0; renderSheet(it); loadThread(it.id); const s2 = $('#sheetRoot .sb'); if (s2) s2.scrollTop = top; });
  if ($('#addFile')) $('#addFile').onclick = () => { const fp = $('#filePick'); fp.value = ''; fp.onchange = () => uploadFiles(it, [...fp.files]); fp.click(); };
  root.querySelectorAll('[data-rmfile]').forEach(b => b.onclick = async e => {
    e.preventDefault(); e.stopPropagation(); if (!confirm('حذف الملف؟')) return;
    const files = [...(it.files || [])]; files.splice(+b.dataset.rmfile, 1);
    await updateItem(it.id, { files }, true); renderSheet(it); loadThread(it.id);
  });
  $('#cSend').onclick = () => sendComment(it);
  $('#cText').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendComment(it); });
  bindActions(it);
  const ar = $('#archive'); if (ar) ar.onclick = async () => { if (!confirm('أرشفة «' + it.title + '»؟')) return; await updateItem(it.id, { stage: 'archived' }, true); logAct(it.id, 'archived', it.stage, 'archived'); S.items = S.items.filter(x => x.id !== it.id); closeSheet(); renderAll(); toast('تمت الأرشفة'); };
}
function fileTile(f, i) {
  const u = safeUrl(f.url), img = /\.(jpe?g|png|webp|gif)$/i.test(f.name || u.split('?')[0]), vid = /\.(mp4|mov|webm|m4v)$/i.test(f.name || u);
  return '<a class="file" href="' + esc(u) + '" target="_blank" rel="noopener" style="' + (img ? 'background-image:url(\'' + esc(u) + '\')' : '') + '">' + (img ? '' : (vid ? ic('film') + '<br>' : ic('file') + '<br>') + esc((f.name || '').slice(0, 22))) + '<button class="x" data-rmfile="' + i + '">×</button></a>';
}
async function uploadFiles(it, files) {
  if (!files.length) return;
  const big = files.find(f => f.size > 50 * 1024 * 1024);
  if (big) return toast('الملف «' + big.name + '» أكبر من 50MB — اضغطه أو حط رابط Drive', 4000);
  toast('جاري الرفع…', 1500);
  const out = [...(it.files || [])];
  for (const f of files) {
    const clean = f.name.replace(/[^\w.\-]+/g, '_').slice(-60);
    const path = 'hq/' + it.id + '/' + Date.now() + '_' + clean;
    const { error } = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined, upsert: false });
    if (error) { toast('فشل رفع ' + f.name); console.error(error); continue; }
    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    out.push({ name: f.name, url: data.publicUrl, by: S.me.id, at: new Date().toISOString() });
  }
  await updateItem(it.id, { files: out }, true); logAct(it.id, 'files', null, null, files.length + ' ملف');
  toast('تم الرفع'); renderSheet(it); loadThread(it.id); renderAllBg();
}
function actionButtons(it) {
  const s = it.stage, appr = isApprover();
  if (s === 'review') return appr ? '<button class="btn ok" data-act="approve">موافقة</button><button class="btn bad" data-act="changes">طلب تعديل</button>' : '<div class="muted small grow" style="text-align:center;padding:8px">مستني موافقة ' + esc(approverNames()) + '</div>';
  if (s === 'idea') return '<button class="btn pri" data-act="next">ابدأ السكريبت</button>';
  if (s === 'script') return '<button class="btn pri" data-act="next">جاهز للتصوير</button><button class="btn" data-act="review">مراجعة السكريبت</button>';
  if (s === 'shoot') return '<button class="btn pri" data-act="next">اتصور — للمونتاج</button>';
  if (s === 'edit') return '<button class="btn pri" data-act="review">إرسال للمراجعة</button>';
  if (s === 'approved') return '<button class="btn pri" data-act="next">تم الجدولة / الرفع على Drive</button><button class="btn" data-act="posted">تم النشر</button>';
  if (s === 'scheduled') return '<button class="btn pri" data-act="posted">تم النشر</button>';
  return '<div class="muted small grow" style="text-align:center;padding:8px">منشور' + (it.posted_at ? ' · ' + fmtTime(it.posted_at) : '') + '</div>';
}
function bindActions(it) {
  document.querySelectorAll('#actions [data-act]').forEach(b => b.onclick = async () => {
    const a = b.dataset.act;
    if (a === 'approve') await moveStage(it, 'approved');
    else if (a === 'changes') return askChanges(it, true);
    else if (a === 'review') return sendToReview(it);
    else if (a === 'posted') { const u = prompt('رابط البوست (اختياري):', it.post_url || ''); if (u === null) return; await moveStage(it, 'posted', { post_url: safeUrl(u.trim()) || null }); }
    else if (a === 'next') { const nx = STAGES[SI[it.stage] + 1]; if (nx) await moveStage(it, nx.k); }
    else if (a === 'toshoot') return chooseShoot('أضف الفكرة لخطة تصوير', async sh => { if (sh && await addIdeaCardToShoot(sh, it)) { if (S.openId === it.id) { renderSheet(it); loadThread(it.id); } } });
    if (S.openId === it.id) { renderSheet(it); loadThread(it.id); }
  });
}
async function sendToReview(it) {
  const sd = it.stage_data || {}, hasMedia = (it.files || []).length || it.drive_link || Object.values(sd).some(x => (x.files || []).length || (x.links || []).length);
  if (SI[it.stage] >= SI.edit && !hasMedia && !confirm('مفيش ملف أو رابط Drive مرفق. ترسل للمراجعة برضه؟')) return;
  if (it.type !== 'story' && SI[it.stage] >= SI.edit && !it.caption && !confirm('الكابشن فاضي. ترسل برضه؟')) return;
  await moveStage(it, 'review');
  if (S.openId === it.id) { renderSheet(it); loadThread(it.id); }
}
function askChanges(it, inSheet) {
  if (!it) return;
  const note = prompt('إيه التعديلات المطلوبة على «' + it.title + '»؟');
  if (!note || !note.trim()) return;
  const back = SI[it.stage] <= SI.script ? 'script' : 'edit';
  moveStage(it, back, { changes: note.trim(), force: true }).then(() => {
    sb.from('hq_comments').insert({ item_id: it.id, author: S.me.id, text: 'تعديلات: ' + note.trim() });
    if (S.openId === it.id) { renderSheet(it); loadThread(it.id); }
  });
}
async function loadThread(id) {
  const [{ data: cs }, { data: acts }] = await Promise.all([
    sb.from('hq_comments').select('*').eq('item_id', id).order('created_at'),
    sb.from('hq_activity').select('*').eq('item_id', id).order('created_at', { ascending: false }).limit(30)
  ]);
  if (S.openId !== id) return;
  const th = $('#thread'); if (th) th.innerHTML = (cs || []).length ? cs.map(c => '<div class="cmt">' + av(c.author) + '<div class="bub"><div class="row"><span class="who">' + esc(firstName(c.author)) + '</span><span class="tm">' + fmtTime(c.created_at) + '</span></div><p dir="auto">' + esc(c.text) + '</p></div></div>').join('') : '<div class="muted small">لا توجد تعليقات بعد</div>';
  const ac = $('#acts'); if (ac) ac.innerHTML = (acts || []).map(a => '<div class="act">' + fmtTime(a.created_at) + ' · <b>' + esc(firstName(a.actor)) + '</b> ' + actText(a) + '</div>').join('') || '<div class="muted">—</div>';
}
function actText(a) {
  if (a.action === 'created') return 'أنشأ المحتوى';
  if (a.action === 'stage') return 'نقله إلى ' + (SM[a.to_stage] ? SM[a.to_stage].n : a.to_stage);
  if (a.action === 'changes') return 'طلب تعديلات: ' + esc(a.note || '');
  if (a.action === 'owner') return 'غيّر المسؤول إلى ' + esc(a.note || '');
  if (a.action === 'files') return 'رفع ' + esc(a.note || 'ملفات');
  if (a.action === 'archived') return 'أرشفه';
  if (a.action === 'shoot') return ic('camera') + esc(a.note || 'من خطة تصوير');
  if (a.action === 'needs_shoot') return ic('camera') + esc(a.note || 'الفوتيج مش كفاية');
  if (a.action === 'publish') return ic('folder') + esc(a.note || 'تحديث من طابور النشر');
  return esc(a.action);
}
async function sendComment(it) {
  const ta = $('#cText'), text = ta.value.trim(); if (!text) return;
  $('#cSend').disabled = true;
  const { error } = await sb.from('hq_comments').insert({ item_id: it.id, author: S.me.id, text });
  $('#cSend').disabled = false;
  if (error) return toast('لم يتم الإرسال');
  ta.value = '';
  const mentioned = S.team.filter(m => text.includes('@' + firstName(m.id)) || text.includes('@' + m.name)).map(m => m.id);
  push([it.owner, ...(it.helpers || []), ...mentioned], '💬 ' + firstName(S.me.id) + ' على «' + it.title + '»', text.slice(0, 120));
  loadThread(it.id);
}
function refreshSheetLive() {
  const it = S.items.find(x => x.id === S.openId); if (!it || document.querySelector('.overlay.stack')) return;
  const ae = document.activeElement;
  if (ae && $('#sheetRoot').contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return; // never clobber typing
  const scroller = $('#sheetRoot .sb'), top = scroller ? scroller.scrollTop : 0;
  renderSheet(it); loadThread(it.id);
  const sc = $('#sheetRoot .sb'); if (sc) sc.scrollTop = top;
}
function renderAllBg() { const id = S.openId; S.openId = null; renderAll(); S.openId = id; }


/* ───────── LINKS: content ↔ tasks / briefs / ads ───────── */
/* ───────── FOOTAGE SOURCE ─────────
   Where the edit's footage comes from: a new shoot, or footage we already have.
   Old footage was shot for a specific edit, so a card that re-uses it says which footage
   and what the new edit should look like; if it isn't enough, the editor sends the card
   back to a shoot plan in one tap (hq_content_needs_shoot). */
const FOOTAGE = { new_shoot: 'تصوير جديد', existing: 'فوتيج قديم موجود' };
function footageBlock(it) {
  const s = it.stage;
  if (!['shoot', 'edit', 'review'].includes(s) && !it.footage_source) return '';
  const src = it.footage_source || (it.shoot_id ? 'new_shoot' : '');
  const sh = it.shoot_id && typeof shootById === 'function' ? shootById(it.shoot_id) : null;
  let h = '<div class="sectitle">الفوتيج</div><div class="card ftblock"><div class="seg" id="ftSrc">' +
    Object.entries(FOOTAGE).map(([k, n]) => '<button data-fs="' + k + '" class="' + (src === k ? 'on' : '') + '">' + n + '</button>').join('') + '</div>';
  if (!src && s === 'edit') h += '<div class="alert warn" style="margin:10px 0 0">حدد الفوتيج منين — عشان اللي بيعمل المونتاج يعرف هيشتغل على إيه.</div>';
  if (src === 'new_shoot') {
    h += sh ? '<button class="linkbtn" data-ftshoot="' + sh.id + '" style="margin-top:10px">' + ic('camera', 14) + ' من خطة التصوير: ' + esc(sh.title) + '</button>' : '<div class="muted small" style="margin-top:10px">لسه مش مربوط بخطة تصوير.</div>';
    if (it.footage_note) h += '<div class="alert warn" style="margin:10px 0 0"><b>ناقص:</b> ' + esc(it.footage_note) + '</div>';
  }
  if (src === 'existing') {
    h += '<label class="lb">أنهي فوتيج؟ (من أنهي تصوير، فين على Drive)</label><textarea dir="auto" class="inp" data-f="footage_note" rows="2" placeholder="مثال: خام تصوير الشتاء — فولدر Basic dress، اللقطات من 3 لـ 9">' + esc(it.footage_note || '') + '</textarea>' +
      '<label class="lb">شكل المونتاج الجديد (مرجع)</label>' + (safeUrl(it.ref_url) ? linkCard(it.ref_url) : '') +
      '<input class="inp" data-f="ref_url" dir="ltr" style="margin-top:8px" value="' + esc(it.ref_url || '') + '" placeholder="رابط ريل أو بوست بالشكل المطلوب">';
  }
  if (['edit', 'review'].includes(s) || (s === 'shoot' && !it.shoot_id)) h += '<button class="btn sm" data-ftneed style="margin-top:12px;width:100%">' + ic('camera', 15) + ' الفوتيج مش كفاية — محتاج تصوير</button>';
  return h + '</div>';
}
function bindFootage(it) {
  const root = $('#sheetRoot'), rer = () => { const sc = $('#sheetRoot .sb'), top = sc ? sc.scrollTop : 0; renderSheet(it); loadThread(it.id); const s2 = $('#sheetRoot .sb'); if (s2) s2.scrollTop = top; };
  root.querySelectorAll('[data-fs]').forEach(b => b.onclick = async () => {
    const v = b.dataset.fs; if (it.footage_source === v) return;
    if (await updateItem(it.id, { footage_source: v }, true)) { rer(); renderAllBg(); }
  });
  const fsh = root.querySelector('[data-ftshoot]'); if (fsh) fsh.onclick = () => { closeSheet(); openShoot(fsh.dataset.ftshoot); };
  const need = root.querySelector('[data-ftneed]');
  if (need) need.onclick = () => {
    const note = prompt('إيه اللي ناقص في الفوتيج؟ (زوايا، لقطات، قطع…)', it.footage_note || '');
    if (note === null) return;
    chooseShoot('ابعت الكارت لخطة تصوير', async sh => {
      if (!sh) return;
      const { data, error } = await sb.rpc('hq_content_needs_shoot', { p_item: it.id, p_shoot: sh.id, p_note: note.trim() || null });
      if (error) { console.error(error); return toast(/shoot_not_open/.test(error.message) ? 'خطة التصوير دي مقفولة' : 'تعذر الإرسال — حاول مرة أخرى'); }
      Object.assign(it, { shoot_id: sh.id, footage_source: 'new_shoot', footage_note: note.trim() || null, stage: (data && data.stage) || it.stage });
      push([sh.owner, it.created_by], '🎥 كارت محتاج تصوير', it.title + (note.trim() ? ' — ناقص: ' + note.trim() : '') + ' → ' + sh.title);
      await loadShoots();
      toast('اتبعت لخطة «' + sh.title + '»');
      if (S.openId === it.id) { renderSheet(it); loadThread(it.id); }
      renderAllBg();
    });
  };
}
function linkedTasksBlock(it) {
  const ts = S.tasks.filter(t => t.content_id === it.id);
  const src = [];
  if (it.brief_id) { const b = S.briefs.find(x => x.id === it.brief_id); if (b) src.push('<a class="chip-link" href="#/briefs/' + b.id + '">من بريف ' + esc(firstName(b.created_by)) + ' · ' + fmtShort(b.created_at) + '</a>'); }
  if (it.ad_id) src.push('<button class="chip-link" data-openad="' + it.ad_id + '">من إعلان Adlumi</button>');
  return '<div class="sectitle">مهام مرتبطة <span class="muted small">' + ts.length + '</span></div>' +
    (src.length ? '<div class="row wrap" style="margin-bottom:8px">' + src.join('') + '</div>' : '') +
    (ts.length ? '<div class="list">' + ts.map(t => taskCard(t, { compact: true })).join('') + '</div>' : '') +
    (isAdmin() ? '<button class="btn sm" data-linktask="' + it.id + '" style="margin-top:8px">+ مهمة مرتبطة بالمحتوى ده</button>' : '');
}
document.addEventListener('click', e => {
  const lt = e.target.closest('[data-linktask]'); if (lt) { const it = S.items.find(x => x.id === lt.dataset.linktask); newTask({ content_id: lt.dataset.linktask, title: it ? it.title : '' }); return; }
  const ad = e.target.closest('[data-openad]'); if (ad) { openAd(ad.dataset.openad); return; }
  const tk = e.target.closest('#sheetRoot [data-task]'); if (tk && !e.target.closest('button:not([data-task]),a')) { openTask(tk.dataset.task); }
});
VIEWS.home = viewHome; VIEWS.content = viewBoard; VIEWS.calendar = viewCal; VIEWS.ideas = viewResearch; VIEWS.stats = viewStats;


/* ───────── STAGE WORKSPACE: each stage keeps its own notes, links and files ───────── */
const STAGE_WS = {
  idea: { main: [['brief', 'البريف / الفكرة', 'الهدف، الجمهور، الإحساس المطلوب', 4]], ref: true, notes: 'أفكار أو مراجع إضافية', link: 'رابط مرجع أو فكرة' },
  script: { main: [['script', 'السكريبت / الشوت ليست', 'المشهد 1: …\nالمشهد 2: …', 7]], notes: 'ملاحظات على السكريبت', link: 'رابط مستند السكريبت أو مرجع' },
  shoot: { notes: 'مكان التصوير، الموديل، القطع، الإضاءة، المعدات…', link: 'رابط فولدر الخام على Drive' },
  edit: { main: [['caption', 'الكابشن', 'الكابشن + الهاشتاجات', 5]], cap: true, notes: 'ملاحظات المونتاج، الموسيقى، النسخ', link: 'رابط النسخة النهائية على Drive' },
  review: { notes: 'ملاحظات المراجعة', link: 'رابط للمراجعة' },
  approved: { notes: 'تعليمات الرفع أو الجدولة', link: 'رابط فولدر النشر على Drive' },
  scheduled: { notes: 'تفاصيل الجدولة', link: 'رابط الجدولة' },
  posted: { post: true, notes: 'نتائج وملاحظات بعد النشر', link: 'رابط البوست أو الإحصائيات' }
};
S.stageTab = S.stageTab || {};
function stageCount(it, k) { const d = (it.stage_data || {})[k] || {}; return (d.links || []).length + (d.files || []).length + (d.notes ? 1 : 0); }
function stageWorkspace(it) {
  const idx = SI[it.stage] ?? 0;
  let last = idx; STAGES.forEach((s, i) => { if (stageCount(it, s.k)) last = Math.max(last, i); });
  const tab = S.stageTab[it.id] && SI[S.stageTab[it.id]] <= last ? S.stageTab[it.id] : it.stage;
  const cfg = STAGE_WS[tab] || {}, d = (it.stage_data || {})[tab] || {};
  const fld = (key, label, ph, rows) => '<label class="lb">' + label + '</label><textarea dir="auto" class="inp" data-f="' + key + '" rows="' + rows + '" placeholder="' + esc(ph) + '">' + esc(it[key] || '') + '</textarea>';
  const who = (by, at) => '<span class="muted small">' + esc(firstName(by)) + (at ? ' · ' + fmtTime(at) : '') + '</span>';
  const canRm = by => by === S.me.id || isAdmin();
  let h = '<div class="sectitle">شغل كل مرحلة</div><div class="stabs">' + STAGES.slice(0, last + 1).map(s => {
    const n = stageCount(it, s.k);
    return '<button class="stab' + (s.k === tab ? ' on' : '') + (s.k === it.stage ? ' cur' : '') + '" data-stab="' + s.k + '">' + s.n + (n ? '<i>' + n + '</i>' : '') + '</button>';
  }).join('') + '</div><div class="spanel">';
  if (tab !== it.stage) h += '<div class="muted small" style="margin-bottom:6px">بتشوف مرحلة «' + SM[tab].n + '» — الكارت حاليًا في «' + SM[it.stage].n + '». تقدر تضيف هنا برضه.</div>';
  (cfg.main || []).forEach(m => { h += fld(m[0], m[1], m[2], m[3]); });
  if (cfg.cap) h += '<div class="muted small lat" id="capCount" style="text-align:left">' + (it.caption || '').length + ' / 2200</div>';
  if (cfg.ref) {
    h += '<label class="lb">المرجع (ريل / بوست / تيك توك / يوتيوب)</label>';
    if (safeUrl(it.ref_url)) h += linkCard(it.ref_url);
    else if (it.ref_thumb) h += '<div class="thumb" style="background-image:url(\'' + esc(it.ref_thumb) + '\')"></div>';
    h += '<input class="inp" data-f="ref_url" dir="ltr" style="margin-top:8px" value="' + esc(it.ref_url || '') + '" placeholder="الصق رابط الريل أو البوست — هتظهر الصورة والمشاهدات واللايكات">';
  }
  if (cfg.post) h += '<label class="lb">رابط البوست بعد النشر</label><div class="linkrow"><input class="inp" data-f="post_url" value="' + esc(it.post_url || '') + '" placeholder="https://instagram.com/p/…">' + (safeUrl(it.post_url) ? '<a class="btn" href="' + esc(safeUrl(it.post_url)) + '" target="_blank" rel="noopener">فتح</a>' : '') + '</div>';
  h += '<label class="lb">ملاحظات المرحلة</label><textarea dir="auto" class="inp" data-snote="' + tab + '" rows="3" placeholder="' + esc(cfg.notes || '') + '">' + esc(d.notes || '') + '</textarea>' + (d.notes_by ? '<div style="margin-top:4px">' + who(d.notes_by, d.notes_at) + '</div>' : '');
  h += '<label class="lb">روابط المرحلة <span class="muted small">(' + (d.links || []).length + ')</span></label>' +
    (d.links || []).map(l => isSocialLink(l.url)
      ? '<div class="lrow rich"><div class="grow">' + (l.label && l.label !== 'رابط' ? '<b class="small">' + esc(l.label) + '</b>' : '') + linkCard(l.url, { compact: true }) + '<div>' + who(l.by, l.at) + '</div></div>' + (canRm(l.by) ? '<button class="xbtn" data-srm="links" data-sid="' + esc(l.id) + '" title="حذف">' + ic('x') + '</button>' : '') + '</div>'
      : '<div class="lrow"><a href="' + esc(safeUrl(l.url) || '#') + '" target="_blank" rel="noopener"><b>' + esc(l.label || 'رابط') + '</b><span dir="ltr">' + esc(l.url) + '</span></a>' + who(l.by, l.at) + (canRm(l.by) ? '<button class="xbtn" data-srm="links" data-sid="' + esc(l.id) + '" title="حذف">' + ic('x') + '</button>' : '') + '</div>').join('') +
    '<div class="slinkadd"><input class="inp" id="slLabel" placeholder="اسم الرابط (مثال: فولدر الخام)"><input class="inp" id="slUrl" dir="ltr" placeholder="' + esc(cfg.link ? 'https://… ' : 'https://') + '"><button class="btn" id="slAdd">+ إضافة رابط</button></div>' +
    '<div class="muted small" style="margin-top:4px">' + esc(cfg.link || '') + ' — كل رابط بيتضاف، مفيش حاجة بتتمسح.</div>';
  h += '<label class="lb">ملفات المرحلة <span class="muted small">(' + (d.files || []).length + ')</span></label><div class="files">' +
    (d.files || []).map(f => { const u = safeUrl(f.url), img = /\.(jpe?g|png|webp|gif)$/i.test(f.name || u.split('?')[0]), vid = /\.(mp4|mov|webm|m4v)$/i.test(f.name || u);
      return '<a class="file" href="' + esc(u) + '" target="_blank" rel="noopener" title="' + esc(f.name + ' · ' + firstName(f.by)) + '" style="' + (img ? 'background-image:url(\'' + esc(u) + '\')' : '') + '">' + (img ? '' : (vid ? ic('film') + '<br>' : ic('file') + '<br>') + esc((f.name || '').slice(0, 22))) + (canRm(f.by) ? '<button class="x" data-srm="files" data-sid="' + esc(f.id) + '">×</button>' : '') + '</a>'; }).join('') +
    '<label class="file add" id="sfAdd">+</label><label class="file add shop" id="sfProd" title="صور من منتجات Shopify">' + ic('bag') + '<br><small>Shopify</small></label></div><div class="muted small" style="margin-top:6px">صور أو فيديو لحد 50MB. الفيديوهات الكبيرة: اضغطها من «ضغط الملفات» أو حط رابط Drive.</div>';
  // older single fields from before stages had their own space
  const legacy = (it.files || []).length || it.drive_link;
  if (legacy && (tab === 'edit' || tab === it.stage)) h += '<details class="legacy"><summary>ملفات وروابط من قبل التحديث</summary>' +
    (it.drive_link ? '<div class="lrow"><a href="' + esc(safeUrl(it.drive_link) || '#') + '" target="_blank" rel="noopener"><b>رابط Google Drive</b><span dir="ltr">' + esc(it.drive_link) + '</span></a></div>' : '') +
    ((it.files || []).length ? '<div class="files" id="files" style="margin-top:8px">' + it.files.map((f, i) => fileTile(f, i)).join('') + '</div>' : '') + '</details>';
  return h + '</div>';
}
async function stagePatch(it, args) {
  const { data, error } = await sb.rpc('hq_stage_patch', Object.assign({ p_item: it.id }, args));
  if (error) { console.error(error); toast('لم يتم الحفظ — حاول مرة أخرى'); return false; }
  it.stage_data = data || it.stage_data;
  return true;
}
function bindStageWorkspace(it) {
  const root = $('#sheetRoot'), tab = (root.querySelector('.stab.on') || {}).dataset?.stab || it.stage;
  const rerender = () => { const sc = $('#sheetRoot .sb'), top = sc ? sc.scrollTop : 0; renderSheet(it); loadThread(it.id); const s2 = $('#sheetRoot .sb'); if (s2) s2.scrollTop = top; };
  root.querySelectorAll('[data-stab]').forEach(b => b.onclick = () => { S.stageTab[it.id] = b.dataset.stab; rerender(); });
  const cap = root.querySelector('[data-f="caption"]'); if (cap) cap.addEventListener('input', () => { const c = $('#capCount'); if (c) c.textContent = cap.value.length + ' / 2200'; });
  const note = root.querySelector('[data-snote]');
  if (note) note.addEventListener('change', async () => {
    const t = note.value.trim(), prev = ((it.stage_data || {})[tab] || {}).notes || '';
    if (t === prev) return;
    if (await stagePatch(it, { p_stage: tab, p_op: 'note', p_kind: 'notes', p_text: t })) toast('تم حفظ ملاحظات «' + SM[tab].n + '»', 1300);
  });
  const add = $('#slAdd');
  if (add) add.onclick = async () => {
    const label = $('#slLabel').value.trim(), raw = $('#slUrl').value.trim(), url = safeUrl(raw);
    if (!url) return toast('حط رابط صحيح يبدأ بـ https://');
    add.disabled = true;
    if (await stagePatch(it, { p_stage: tab, p_op: 'add', p_kind: 'links', p_entry: { label: label || 'رابط', url } })) {
      logAct(it.id, 'files', null, null, 'رابط في «' + SM[tab].n + '»: ' + (label || url));
      push([it.owner, ...(it.helpers || [])], '🔗 رابط جديد في «' + SM[tab].n + '»', it.title + ' — ' + (label || url));
      toast('اتضاف الرابط'); rerender();
    } else add.disabled = false;
  };
  const sf = $('#sfAdd');
  if (sf) sf.onclick = async () => {
    const files = await pickFiles('image/*,video/*,application/pdf', true);
    if (!files.length) return;
    const big = files.find(f => f.size > 50 * 1024 * 1024);
    if (big) return toast('الملف «' + big.name + '» أكبر من 50MB — اضغطه أو حط رابط Drive', 4000);
    toast('جاري الرفع…', 1500);
    let n = 0;
    for (const f of files) {
      try { const r = await uploadFile(f, 'hq/' + it.id + '/' + tab); if (await stagePatch(it, { p_stage: tab, p_op: 'add', p_kind: 'files', p_entry: { name: r.name, url: r.url, type: r.type } })) n++; }
      catch (e) { console.error(e); toast('فشل رفع ' + f.name); }
    }
    if (n) { logAct(it.id, 'files', null, null, n + ' ملف في «' + SM[tab].n + '»'); toast('اترفع ' + n + ' ملف'); rerender(); }
  };
  const sp = $('#sfProd');
  if (sp) sp.onclick = async () => {
    const files = await pickProductImages(it.product_ids || [], 'صور منتج لمرحلة «' + SM[tab].n + '»');
    if (files && files.length && await addProductImagesToItem(it, null, files, tab)) rerender();
  };
  root.querySelectorAll('[data-srm]').forEach(b => b.onclick = async e => {
    e.preventDefault(); e.stopPropagation();
    if (!confirm('حذف؟')) return;
    if (await stagePatch(it, { p_stage: tab, p_op: 'remove', p_kind: b.dataset.srm, p_id: b.dataset.sid })) rerender();
  });
}
