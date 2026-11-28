/* ───────── SHOOT PLANS (خطط التصوير) ─────────
   One plan = one shoot that produces many content cards.
   أفكار → تخطيط → تجهيز → يوم التصوير → اختيار اللقطات → في النشر → مكتمل
   Approval (by approvers) is needed before تجهيز; the database enforces it too.
   Lists inside a plan (ideas, shots, crew, equipment) are edited through hq_shoot_patch,
   one entry at a time, so people working at the same time never overwrite each other.
   The budget sits in hq_shoot_budget, readable only by admins and approvers. */

const SHOOT_STAGES = [
  { k: 'ideas', n: 'أفكار', c: 'idea' },
  { k: 'planning', n: 'تخطيط', c: 'script' },
  { k: 'prep', n: 'تجهيز', c: 'shoot' },
  { k: 'shoot_day', n: 'يوم التصوير', c: 'review' },
  { k: 'selects', n: 'اختيار اللقطات', c: 'edit' },
  { k: 'publishing', n: 'في النشر', c: 'scheduled' },
  { k: 'done', n: 'مكتمل', c: 'approved' }
];
const SHI = Object.fromEntries(SHOOT_STAGES.map((s, i) => [s.k, i]));
const SHM = Object.fromEntries(SHOOT_STAGES.map(s => [s.k, s]));
const NEEDS_APPROVAL = SHI.prep;
const SHOOT_TABS = [['plan', 'الخطة'], ['ideas', 'الأفكار'], ['shots', 'الشوت ليست'], ['call', 'الكول شيت'], ['budget', 'الميزانية'], ['content', 'المحتوى']];
const DEFAULT_TAB = { ideas: 'ideas', planning: 'shots', prep: 'call', shoot_day: 'shots', selects: 'shots', publishing: 'content', done: 'content' };
const canBudget = () => isAdmin() || isApprover();

S.shoots = []; S.shootBudget = {}; S.openShootId = null; S.shootTab = {};

async function loadShoots() {
  const { data, error } = await sb.from('hq_shoots').select('*').neq('stage', 'archived').order('created_at', { ascending: false }).limit(300);
  if (error) { console.error(error); return; }
  S.shoots = data || [];
}
async function loadBudget(id) {
  if (!canBudget()) return null;
  const { data } = await sb.from('hq_shoot_budget').select('*').eq('shoot_id', id).maybeSingle();
  S.shootBudget[id] = data || { shoot_id: id, lines: [], currency: 'EGP' };
  return S.shootBudget[id];
}
const shootById = id => S.shoots.find(x => x.id === id);
const shootCards = sh => S.items.filter(i => i.shoot_id === sh.id);
const shootTag = k => { const s = SHM[k] || SHOOT_STAGES[0]; return '<span class="stage-tag" style="--c:var(--s-' + s.c + ')">' + s.n + '</span>'; };
function shootStatus(sh) {
  if (sh.approved_at) return '<span class="pill okp">' + ic('check') + ' معتمدة</span>';
  if (sh.changes_note) return '<span class="pill late">مطلوب تعديلات</span>';
  if (sh.submitted_at) return '<span class="pill soon">بانتظار الموافقة</span>';
  return '';
}
function shootDate(sh) {
  if (!sh.shoot_date) return '';
  const d = dayDiff(sh.shoot_date), done = SHI[sh.stage] >= SHI.selects;
  const cls = done ? '' : d < 0 ? 'late' : d <= 2 ? 'soon' : 'info';
  return '<span class="pill ' + cls + '">' + ic('cal') + ' ' + (done ? fmtShort(sh.shoot_date) : d === 0 ? 'التصوير النهارده' : d === 1 ? 'التصوير بكرة' : d < 0 ? 'فات ' + fmtShort(sh.shoot_date) : fmtDay(sh.shoot_date)) + '</span>';
}
function shootProgress(sh) {
  const shots = sh.shots || [];
  if (SHI[sh.stage] >= SHI.publishing) {
    const cards = shootCards(sh), posted = cards.filter(c => c.stage === 'posted').length;
    return cards.length ? { n: posted, of: cards.length, l: 'منشور' } : null;
  }
  if (SHI[sh.stage] >= SHI.shoot_day) return shots.length ? { n: shots.filter(x => x.done).length, of: shots.length, l: 'لقطة اتصورت' } : null;
  return shots.length ? { n: shots.length, of: 0, l: 'لقطة في الخطة' } : null;
}
const progBar = p => !p ? '' : '<div class="shprog"><span class="muted small">' + p.n + (p.of ? ' من ' + p.of : '') + ' ' + p.l + '</span>' + (p.of ? '<div class="prog"><i style="width:' + Math.round(p.n / p.of * 100) + '%"></i></div>' : '') + '</div>';

/* ───────── PAGE: board of shoot plans ───────── */
function viewShoots(v) {
  const wide = window.innerWidth >= 1000;
  const active = S.shoots.filter(s => s.stage !== 'done'), done = S.shoots.filter(s => s.stage === 'done');
  const waiting = active.filter(s => s.submitted_at && !s.approved_at);
  let html = '';
  if (canBudget() && waiting.length) html += '<div class="alert warn" style="margin:0 0 12px">' + waiting.length + ' خطة تصوير مستنية موافقتك</div>';
  const card = sh => {
    const p = shootProgress(sh);
    return '<div class="card ccard compact shcard" data-shoot="' + sh.id + '" tabindex="0"><div class="grow"><div class="t">' + esc(sh.title) + '</div>' +
      '<div class="meta">' + shootDate(sh) + shootStatus(sh) + (sh.location ? '<span class="pill">' + ic('pin') + ' ' + esc(sh.location) + '</span>' : '') + '</div>' + progBar(p) + '</div>' + (sh.owner ? av(sh.owner) : '') + '</div>';
  };
  if (!S.shoots.length) html += '<div class="empty">مفيش خطط تصوير لسه.<br><button class="btn pri" id="shNew0" style="margin-top:10px">' + ic('camera') + ' أول خطة تصوير</button></div>';
  else if (wide) {
    html += '<div class="kanban fit">' + SHOOT_STAGES.filter(s => s.k !== 'done').map(s => {
      const col = active.filter(x => x.stage === s.k).sort((a, b) => (a.shoot_date || '9999').localeCompare(b.shoot_date || '9999'));
      return '<section class="kcol" style="--c:var(--s-' + s.c + ')"><h3><span>' + s.n + '</span><span class="kn">' + col.length + '</span></h3><div class="kbody">' + (col.map(card).join('') || '<div class="kempty">لا يوجد</div>') + '</div></section>';
    }).join('') + '</div>';
  } else {
    html += SHOOT_STAGES.filter(s => s.k !== 'done').map(s => {
      const col = active.filter(x => x.stage === s.k); if (!col.length) return '';
      return '<h2 class="sec"><span class="stage-tag" style="--c:var(--s-' + s.c + ')">' + s.n + '</span><span class="n">' + col.length + '</span></h2><div class="list">' + col.map(card).join('') + '</div>';
    }).join('');
  }
  if (done.length) html += '<h2 class="sec">مكتملة <span class="n">' + done.length + '</span></h2><div class="list">' + done.slice(0, 12).map(card).join('') + '</div>';
  v.innerHTML = html;
  $$('[data-shoot]', v).forEach(el => { el.onclick = () => openShoot(el.dataset.shoot); el.onkeydown = e => { if (e.key === 'Enter') openShoot(el.dataset.shoot); }; });
  const n0 = $('#shNew0'); if (n0) n0.onclick = () => newShoot();
}

/* ───────── NEW PLAN ───────── */
function newShoot(pre = {}) {
  const root = sheet('<div class="sh"><b class="grow">خطة تصوير جديدة</b><button class="btn ghost sm" id="x">' + ic('x') + '</button></div><div class="sb">' +
    '<label class="lb">اسم التصوير</label><input class="inp" id="sTitle" value="' + esc(pre.title || '') + '" placeholder="مثال: تصوير مجموعة الشتاء">' +
    '<div class="g2"><div><label class="lb">المسؤول</label><select class="inp" id="sOwner">' + S.team.map(m => '<option value="' + m.id + '"' + (m.id === S.me.id ? ' selected' : '') + '>' + esc(m.name) + '</option>').join('') + '</select></div>' +
    '<div><label class="lb">يوم التصوير (لو معروف)</label><input type="date" class="inp" id="sDate"></div></div>' +
    '<label class="lb">الفكرة والهدف</label><textarea class="inp" id="sBrief" placeholder="إيه اللي عايزين نطلع بيه؟ أي مجموعة؟ الإحساس العام؟"></textarea>' +
    '</div><div class="sf"><button class="btn pri" id="sSave">إنشاء</button></div>');
  $('#x').onclick = closeSheet;
  $('#sSave').onclick = async () => {
    const title = $('#sTitle').value.trim(); if (!title) { $('#sTitle').focus(); return toast('اكتب اسم التصوير'); }
    $('#sSave').disabled = true;
    const row = { title, owner: $('#sOwner').value, shoot_date: $('#sDate').value || null, brief: $('#sBrief').value.trim() || null, stage: 'ideas' };
    const { data, error } = await sb.from('hq_shoots').insert(row).select().single();
    if (error) { $('#sSave').disabled = false; console.error(error); return toast('تعذر الإنشاء'); }
    S.shoots.unshift(data);
    if (data.owner && data.owner !== S.me.id) push([data.owner], '📸 خطة تصوير جديدة عليك', data.title);
    if (S.route !== 'shoots') go('shoots');
    openShoot(data.id);
  };
  setTimeout(() => $('#sTitle') && $('#sTitle').focus(), 80);
}

/* ───────── PLAN SHEET ───────── */
async function openShoot(id) {
  let sh = shootById(id);
  if (!sh) { const { data } = await sb.from('hq_shoots').select('*').eq('id', id).maybeSingle(); if (!data) return toast('خطة التصوير مش موجودة'); S.shoots.unshift(data); sh = data; }
  S.openShootId = id; S.openId = null;
  if (location.hash !== '#shoot=' + id) history.replaceState(null, '', '#shoot=' + id);
  renderShoot(sh);
  if (canBudget() && !S.shootBudget[id]) loadBudget(id).then(() => { if (S.openShootId === id && shootTabOf(sh) === 'budget') renderShoot(sh); });
}
const shootTabOf = sh => S.shootTab[sh.id] || DEFAULT_TAB[sh.stage] || 'plan';
function renderShoot(sh) {
  const tab = shootTabOf(sh), idx = SHI[sh.stage] ?? 0;
  const tabs = SHOOT_TABS.filter(([k]) => k !== 'budget' || canBudget());
  const cnt = { ideas: (sh.ideas || []).length, shots: (sh.shots || []).length, call: (sh.crew || []).length, content: shootCards(sh).length };
  let alert = '';
  if (sh.changes_note) alert += '<div class="alert warn"><b>تعديلات مطلوبة:</b> ' + esc(sh.changes_note) + '</div>';
  if (sh.approved_at) alert += '<div class="alert ok">اعتمدها ' + esc(firstName(sh.approved_by)) + ' · ' + fmtTime(sh.approved_at) + '</div>';
  else if (sh.submitted_at) alert += '<div class="alert warn">اتبعتت للموافقة · ' + fmtTime(sh.submitted_at) + '</div>';
  const sb_ = $('#sheetRoot .sb'), top = sb_ && S._shootScroll === sh.id ? sb_.scrollTop : 0;
  sheet('<div class="sh">' + shootTag(sh.stage) + shootStatus(sh) + '<span class="grow"></span><button class="btn ghost sm" id="shCopy" title="نسخ الرابط">' + ic('link') + '</button><button class="btn ghost sm" id="x">' + ic('x') + '</button></div>' +
    '<div class="sb"><input dir="auto" class="titleinp" data-sf="title" value="' + esc(sh.title) + '">' +
    '<div class="stepper">' + SHOOT_STAGES.map((s, i) => '<button class="' + (i < idx ? 'done' : i === idx ? 'cur' : '') + '" data-shstage="' + s.k + '"' + (i >= NEEDS_APPROVAL && !sh.approved_at && i > idx ? ' disabled title="محتاجة موافقة الأول"' : '') + '>' + s.n + '</button>').join('') + '</div>' +
    alert +
    '<div class="ltabs" style="margin-top:12px">' + tabs.map(([k, n]) => '<button class="' + (k === tab ? 'on' : '') + '" data-shtab="' + k + '">' + n + (cnt[k] ? ' <span class="c">' + cnt[k] + '</span>' : '') + '</button>').join('') + '</div>' +
    '<div id="shBody">' + shootTabHtml(sh, tab) + '</div></div>' +
    '<div class="sf" id="shActions">' + shootActions(sh) + '</div>', { onClose: closeShoot });
  S._shootScroll = sh.id;
  const s2 = $('#sheetRoot .sb'); if (s2 && top) s2.scrollTop = top;
  bindShoot(sh, tab);
}
function closeShoot() { S.openShootId = null; $('#sheetRoot').innerHTML = ''; if (/^#shoot=/.test(location.hash)) history.replaceState(null, '', '#/' + S.route); }

const memberOpts = (sel, none) => (none ? '<option value="">' + none + '</option>' : '') + S.team.map(m => '<option value="' + m.id + '"' + (m.id === sel ? ' selected' : '') + '>' + esc(m.name) + '</option>').join('');
const fieldIn = (sh, key, label, attrs) => '<div><label class="lb">' + label + '</label><input class="inp" data-sf="' + key + '" value="' + esc(sh[key] || '') + '" ' + (attrs || '') + '></div>';
const prodThumbs = ids => (ids || []).map(id => { const p = prod(id); return p ? '<span class="pth" title="' + esc(p.title) + '" style="background-image:url(\'' + esc(shopImg(p.image, 120) || '') + '\')"></span>' : ''; }).join('');

function shootTabHtml(sh, tab) {
  const rmBtn = (list, id) => '<button class="xbtn" data-shrm="' + list + '" data-id="' + esc(id) + '" title="حذف" aria-label="حذف">' + ic('x', 14) + '</button>';
  if (tab === 'plan') return '<label class="lb">الفكرة والهدف</label><textarea dir="auto" class="inp" data-sf="brief" rows="4" placeholder="إيه اللي عايزين نطلع بيه من التصوير ده؟">' + esc(sh.brief || '') + '</textarea>' +
    '<div class="g2"><div><label class="lb">المسؤول</label><select class="inp" data-sf="owner">' + memberOpts(sh.owner, '—') + '</select></div>' + fieldIn(sh, 'shoot_date', 'يوم التصوير', 'type="date"') + '</div>' +
    '<label class="lb">المنتجات والقطع اللي هتتصور</label><div class="plinks">' + (sh.product_ids || []).map(id => { const p = prod(id); return p ? '<div class="plink"><span class="pth" style="background-image:url(\'' + esc(shopImg(p.image, 160) || '') + '\')"></span><span class="grow plt"><b dir="auto">' + esc(p.title) + '</b><span class="muted small">' + prodPrice(p) + '</span></span></div>' : ''; }).join('') + '</div>' +
    '<button class="btn sm" id="shProds" style="margin-top:6px">' + ic('bag') + ' اختار من Shopify</button>' +
    '<label class="lb">ملاحظات</label><textarea dir="auto" class="inp" data-sf="notes" rows="3" placeholder="أي حاجة تانية الفريق لازم يعرفها">' + esc(sh.notes || '') + '</textarea>';

  if (tab === 'ideas') {
    const ideas = sh.ideas || [];
    return '<div class="muted small" style="margin:4px 0 10px">مراجع وأفكار للتصوير. حوّل أي فكرة للشوت ليست لما تتأكد منها.</div>' +
      (ideas.length ? ideas.map(x => '<div class="lrow rich"><div class="grow">' + '<b>' + esc(x.title || 'فكرة') + '</b>' +
        (safeUrl(x.url) ? (isSocialLink(x.url) ? linkCard(x.url, { compact: true }) : '<div><a href="' + esc(safeUrl(x.url)) + '" target="_blank" rel="noopener" dir="ltr" class="small">' + esc(x.url.slice(0, 60)) + '</a></div>') : '') +
        (x.note ? '<div class="muted small" dir="auto">' + esc(x.note) + '</div>' : '') + '<div class="muted small">' + esc(firstName(x.by)) + '</div></div>' +
        '<div class="row" style="flex-direction:column;gap:4px"><button class="btn sm" data-toshot="' + esc(x.id) + '"' + (x.shot ? ' disabled' : '') + '>' + (x.shot ? 'في الشوت ليست ' + ic('check') : '→ للشوت ليست') + '</button>' + rmBtn('ideas', x.id) + '</div></div>').join('') : '<div class="empty">مفيش أفكار لسه</div>') +
      '<div class="slinkadd" style="grid-template-columns:1fr 1.3fr auto"><input class="inp" id="idT" placeholder="الفكرة باختصار"><input class="inp" id="idU" dir="ltr" placeholder="رابط مرجع (اختياري)"><button class="btn" id="idAdd">إضافة</button></div>' +
      '<button class="btn sm ghost" id="idFromCards" style="margin-top:8px">' + ic('board') + ' ضيف من كروت «فكرة»</button>';
  }

  if (tab === 'shots') {
    const shots = sh.shots || [], stage = sh.stage, dayMode = stage === 'shoot_day', selMode = stage === 'selects';
    const sel = S._shotSel && S._shotSel.id === sh.id ? S._shotSel.ids : new Set(shots.filter(x => x.done && !x.made_item).map(x => x.id));
    S._shotSel = { id: sh.id, ids: sel };
    let h = '<div class="muted small" style="margin:4px 0 10px">' + (dayMode ? 'علّم كل لقطة أول ما تتصور.' : selMode ? 'اختار اللقطات اللي هتتحول لكروت محتوى، وبعدين اضغط «اعمل كروت».' : 'كل لقطة: الوصف، النوع، المسؤول عن المونتاج، والقطع.') + '</div>';
    h += shots.length ? '<div class="shots">' + shots.map((x, i) => {
      const made = x.made_item && S.items.find(c => c.id === x.made_item);
      const lead = selMode ? (x.made_item ? '<span class="chk on" title="اتعمل كارت">' + ic('check', 14) + '</span>' : '<button class="chk' + (sel.has(x.id) ? ' on' : '') + '" data-shsel="' + esc(x.id) + '" aria-pressed="' + sel.has(x.id) + '" aria-label="اختيار">' + ic('check', 14) + '</button>')
        : '<button class="chk' + (x.done ? ' on' : '') + '" data-shdone="' + esc(x.id) + '" aria-pressed="' + !!x.done + '" aria-label="اتصورت">' + ic('check', 14) + '</button>';
      return '<div class="shot' + (x.done ? ' is-done' : '') + (dayMode ? ' big' : '') + '">' + lead +
        '<div class="grow"><input dir="auto" class="inp shot-t" data-shot="' + esc(x.id) + '" data-k="title" value="' + esc(x.title || '') + '" placeholder="وصف اللقطة"' + (dayMode ? ' readonly' : '') + '>' +
        (dayMode ? (x.note ? '<div class="muted small" dir="auto">' + esc(x.note) + '</div>' : '') :
          '<div class="shot-meta"><select class="mini" data-shot="' + esc(x.id) + '" data-k="type">' + Object.entries(TYPES).map(([k, n]) => '<option value="' + k + '"' + ((x.type || 'reel') === k ? ' selected' : '') + '>' + n + '</option>').join('') + '</select>' +
          '<select class="mini" data-shot="' + esc(x.id) + '" data-k="owner">' + memberOpts(x.owner, 'المونتاج: —') + '</select>' +
          '<button class="btn sm ghost" data-shprod="' + esc(x.id) + '">' + ic('bag') + ' ' + ((x.product_ids || []).length || '') + '</button><span class="pths">' + prodThumbs(x.product_ids) + '</span></div>' +
          '<input dir="auto" class="inp shot-n" data-shot="' + esc(x.id) + '" data-k="note" value="' + esc(x.note || '') + '" placeholder="ملاحظة: زاوية، إضاءة، حركة…">') +
        (made ? '<button class="linkbtn" data-openitem="' + made.id + '">' + ic('board', 14) + ' ' + SM[made.stage].n + ' — افتح الكارت</button>' : '') + '</div>' +
        (dayMode ? '' : '<div class="shot-ord"><button class="xbtn" data-shmove="' + esc(x.id) + '" data-dir="-1"' + (i ? '' : ' disabled') + ' aria-label="لفوق">▲</button><button class="xbtn" data-shmove="' + esc(x.id) + '" data-dir="1"' + (i < shots.length - 1 ? '' : ' disabled') + ' aria-label="لتحت">▼</button>' + (x.made_item ? '' : rmBtn('shots', x.id)) + '</div>') +
        '</div>';
    }).join('') + '</div>' : '<div class="empty">الشوت ليست فاضية. ضيف أول لقطة.</div>';
    if (!dayMode) h += '<div class="linkrow" style="margin-top:10px"><input class="inp" id="shotNew" dir="auto" placeholder="لقطة جديدة: مثال — ريل الموديل ماشية بالعباية في الشارع"><button class="btn" id="shotAdd">إضافة</button></div>';
    if (selMode || (SHI[stage] >= SHI.shoot_day && shots.some(x => !x.made_item))) h += '<button class="btn pri" id="mkCards" style="width:100%;margin-top:14px">' + ic('board') + ' اعمل كروت محتوى للمختار (' + [...sel].filter(id => shots.find(x => x.id === id && !x.made_item)).length + ')</button>';
    return h;
  }

  if (tab === 'call') {
    const crew = sh.crew || [], eq = sh.equipment || [];
    return '<div class="g2">' + fieldIn(sh, 'shoot_date', 'يوم التصوير', 'type="date"') + fieldIn(sh, 'call_time', 'ميعاد الحضور', 'placeholder="مثال: 9:00 ص"') + '</div>' +
      '<div class="g2">' + fieldIn(sh, 'location', 'اللوكيشن', 'dir="auto" placeholder="الاستوديو / العنوان"') + fieldIn(sh, 'location_url', 'رابط الخريطة', 'dir="ltr" placeholder="https://maps…"') + '</div>' +
      (safeUrl(sh.location_url) ? '<a class="chip-link" style="margin-top:8px" href="' + esc(safeUrl(sh.location_url)) + '" target="_blank" rel="noopener">' + ic('pin', 14) + ' افتح الخريطة</a>' : '') +
      '<div class="sectitle">الفريق يوم التصوير</div>' +
      (crew.length ? '<div class="card">' + crew.map(c => '<div class="srow" style="cursor:default">' + (c.member_id ? av(c.member_id) : '<span class="av" style="background:var(--faint)">' + esc((c.name || '?')[0]) + '</span>') +
        '<span class="grow"><b>' + esc(c.member_id ? nameOf(c.member_id) : c.name) + '</b><span class="muted small"> · ' + esc(c.role || '') + '</span>' + (c.phone ? '<div class="small" dir="ltr" style="text-align:right">' + esc(c.phone) + '</div>' : '') + '</span>' +
        (c.member_id ? '' : '<span class="pill">من برة الفريق</span>') + rmBtn('crew', c.id) + '</div>').join('') + '</div>' : '<div class="empty">ضيف الموديل والمصور وأي حد هيحضر</div>') +
      '<div class="crewadd"><select class="inp" id="cwM"><option value="">من برة الفريق…</option>' + memberOpts('') + '</select><input class="inp" id="cwN" dir="auto" placeholder="الاسم (لو من برة)"><input class="inp" id="cwR" dir="auto" placeholder="الدور: موديل، مصور…"><input class="inp" id="cwP" dir="ltr" placeholder="رقم التليفون"><button class="btn" id="cwAdd">إضافة</button></div>' +
      '<div class="sectitle">المعدات</div>' +
      (eq.length ? eq.map(x => '<div class="srow2"><button class="chk' + (x.done ? ' on' : '') + '" data-eqdone="' + esc(x.id) + '" aria-label="جاهز">' + ic('check', 14) + '</button><span class="grow' + (x.done ? ' done' : '') + '">' + esc(x.title) + '</span>' + rmBtn('equipment', x.id) + '</div>').join('') : '<div class="muted small">مفيش معدات مسجلة</div>') +
      '<div class="linkrow" style="margin-top:8px"><input class="inp" id="eqNew" dir="auto" placeholder="مثال: رينج لايت، ستاند، بطاريات"><button class="btn" id="eqAdd">إضافة</button></div>' +
      '<label class="lb">فولدر الخام على Drive (بعد التصوير)</label><div class="linkrow"><input class="inp" data-sf="raw_link" dir="ltr" value="' + esc(sh.raw_link || '') + '" placeholder="https://drive.google.com/…">' + (safeUrl(sh.raw_link) ? '<a class="btn" href="' + esc(safeUrl(sh.raw_link)) + '" target="_blank" rel="noopener">فتح</a>' : '') + '</div>';
  }

  if (tab === 'budget') {
    if (!canBudget()) return '<div class="empty">الميزانية للمديرين والمعتمدين بس</div>';
    const b = S.shootBudget[sh.id];
    if (!b) return '<div class="skel-card"><span class="skel" style="width:60%"></span><span class="skel" style="width:40%"></span></div>';
    const lines = b.lines || [], total = lines.reduce((a, l) => a + (+l.amount || 0), 0);
    return '<div class="muted small" style="margin:4px 0 10px">' + ic('key', 14) + ' بتظهر للمديرين والمعتمدين بس.</div>' +
      (lines.length ? '<div class="card ptable"><table class="tb"><thead><tr><th>البند</th><th>ملاحظة</th><th class="dcol">المبلغ</th><th></th></tr></thead><tbody>' +
        lines.map(l => '<tr><td>' + esc(l.label) + '</td><td class="muted">' + esc(l.note || '') + '</td><td class="dcol">' + egp(+l.amount || 0) + '</td><td>' + '<button class="xbtn" data-bgrm="' + esc(l.id) + '" aria-label="حذف">' + ic('x', 14) + '</button></td></tr>').join('') +
        '</tbody><tfoot><tr><td colspan="2"><b>الإجمالي</b></td><td class="dcol"><b>' + egp(total) + '</b></td><td></td></tr></tfoot></table></div>' : '<div class="empty">مفيش بنود لسه</div>') +
      '<div class="slinkadd" style="grid-template-columns:1.2fr 1fr .8fr auto"><input class="inp" id="bgL" dir="auto" placeholder="البند: موديل، لوكيشن…"><input class="inp" id="bgN" dir="auto" placeholder="ملاحظة"><input class="inp" id="bgA" type="number" min="0" inputmode="numeric" placeholder="المبلغ"><button class="btn" id="bgAdd">إضافة</button></div>';
  }

  if (tab === 'content') {
    const cards = shootCards(sh);
    if (!cards.length) return '<div class="empty">لسه مفيش كروت محتوى من التصوير ده. بعد التصوير، اختار اللقطات من «الشوت ليست» واعمل لها كروت.</div>';
    const posted = cards.filter(c => c.stage === 'posted').length;
    return progBar({ n: posted, of: cards.length, l: 'منشور' }) + '<div class="list" style="margin-top:10px">' + cards.map(c => ccard(c)).join('') + '</div>';
  }
  return '';
}

function shootActions(sh) {
  const s = sh.stage, appr = canBudget(), mine = sh.owner === S.me.id || sh.created_by === S.me.id;
  const approveBtns = '<button class="btn ok" data-sha="approve">موافقة على الخطة</button><button class="btn bad" data-sha="changes">طلب تعديل</button>';
  if (s === 'ideas') return '<button class="btn pri" data-sha="to:planning">ابدأ التخطيط</button>';
  if (s === 'planning') {
    if (sh.approved_at) return '<button class="btn pri" data-sha="to:prep">للتجهيز والحجز</button>';
    if (sh.submitted_at) return appr ? approveBtns : '<div class="muted small grow" style="text-align:center;padding:8px">مستنية موافقة ' + esc(approverNames()) + '</div>';
    return '<button class="btn pri" data-sha="submit">ابعت الخطة للموافقة</button>' + (appr ? '<button class="btn ok" data-sha="approve">موافقة مباشرة</button>' : '');
  }
  if (s === 'prep') return '<button class="btn pri" data-sha="to:shoot_day">بدأ يوم التصوير</button>';
  if (s === 'shoot_day') return '<button class="btn pri" data-sha="to:selects">خلص التصوير — اختيار اللقطات</button>';
  if (s === 'selects') return '<div class="muted small grow" style="text-align:center;padding:8px">اختار اللقطات من «الشوت ليست» واضغط «اعمل كروت»</div>';
  if (s === 'publishing') return '<div class="muted small grow" style="text-align:center;padding:8px">الخطة هتكتمل لوحدها لما كل كروتها تتنشر</div>';
  return '<div class="muted small grow" style="text-align:center;padding:8px">مكتملة' + (mine ? '' : '') + '</div>';
}

/* ───────── SAVING ───────── */
async function shootUpdate(sh, patch, quiet) {
  const prev = Object.fromEntries(Object.keys(patch).map(k => [k, sh[k]]));
  Object.assign(sh, patch);
  const { data, error } = await sb.from('hq_shoots').update(patch).eq('id', sh.id).select().single();
  if (error) {
    Object.assign(sh, prev);
    toast(/needs_approval/.test(error.message) ? 'الخطة محتاجة موافقة الأول' : /only_approvers/.test(error.message) ? 'الموافقة للمعتمدين بس' : 'لم يتم الحفظ — حاول مرة أخرى', 2600);
    console.error(error); return false;
  }
  Object.assign(sh, data);
  if (!quiet) toast('تم الحفظ', 1100);
  return true;
}
async function shootPatch(sh, list, op, entry, id) {
  const { data, error } = await sb.rpc('hq_shoot_patch', { p_shoot: sh.id, p_list: list, p_op: op, p_entry: entry || null, p_id: id || null });
  if (error) { console.error(error); toast('لم يتم الحفظ — حاول مرة أخرى'); return false; }
  sh[list] = data || [];
  return true;
}
async function saveBudget(sh, lines) {
  const { data, error } = await sb.from('hq_shoot_budget').upsert({ shoot_id: sh.id, lines }).select().single();
  if (error) { console.error(error); toast('لم يتم الحفظ'); return false; }
  S.shootBudget[sh.id] = data; return true;
}
async function moveShoot(sh, to) {
  if (SHI[to] >= NEEDS_APPROVAL && !sh.approved_at) return toast('الخطة محتاجة موافقة الأول', 2400);
  const from = sh.stage;
  if (!(await shootUpdate(sh, { stage: to }, true))) return;
  const crew = (sh.crew || []).map(c => c.member_id).filter(Boolean);
  if (to === 'shoot_day') push([sh.owner, ...crew], '🎬 يوم التصوير بدأ', sh.title);
  toast('اتنقلت إلى «' + SHM[to].n + '»');
  if (from !== to) S.shootTab[sh.id] = DEFAULT_TAB[to];
  renderShoot(sh); renderAllBgShoot();
}
function renderAllBgShoot() { const id = S.openShootId; S.openShootId = null; renderAll(); S.openShootId = id; }

function bindShoot(sh, tab) {
  const root = $('#sheetRoot'), rer = () => renderShoot(sh);
  $('#x').onclick = closeShoot;
  $('#shCopy').onclick = () => { const u = location.origin + location.pathname + '#shoot=' + sh.id; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast('اتنسخ الرابط'), () => prompt('انسخ:', u)); };
  $$('[data-shtab]', root).forEach(b => b.onclick = () => { S.shootTab[sh.id] = b.dataset.shtab; if (b.dataset.shtab === 'budget' && !S.shootBudget[sh.id]) loadBudget(sh.id).then(rer); rer(); });
  $$('[data-shstage]', root).forEach(b => b.onclick = () => { const to = b.dataset.shstage; if (to === sh.stage) return; if (to === 'done') return toast('الخطة بتكتمل لوحدها لما كل كروتها تتنشر', 2600); moveShoot(sh, to); });
  // plain fields save on change
  $$('[data-sf]', root).forEach(el => el.addEventListener('change', async () => {
    const k = el.dataset.sf; let v = el.value.trim();
    if (k === 'title' && !v) { el.value = sh.title; return; }
    if (k === 'location_url' || k === 'raw_link') { if (v && !safeUrl(v)) return toast('الرابط مش صحيح'); }
    if (await shootUpdate(sh, { [k]: v || null })) { if (['shoot_date', 'owner', 'title'].includes(k)) renderAllBgShoot(); if (k === 'location_url' || k === 'raw_link') rer(); }
  }));
  const sp = $('#shProds'); if (sp) sp.onclick = async () => { const ids = await pickProducts(sh.product_ids || [], 'القطع اللي هتتصور'); if (ids === null) return; if (await shootUpdate(sh, { product_ids: ids })) rer(); };
  $$('[data-shrm]', root).forEach(b => b.onclick = async () => { if (!confirm('حذف؟')) return; if (await shootPatch(sh, b.dataset.shrm, 'remove', null, b.dataset.id)) rer(); });
  $$('[data-openitem]', root).forEach(b => b.onclick = () => { closeShoot(); openItem(b.dataset.openitem); });
  $$('[data-open]', root).forEach(el => el.onclick = e => { if (e.target.closest('button,a,input,select,textarea')) return; closeShoot(); openItem(el.dataset.open); });

  // ideas
  const ia = $('#idAdd');
  if (ia) ia.onclick = async () => {
    const t = $('#idT').value.trim(), u = $('#idU').value.trim();
    if (!t && !u) return $('#idT').focus();
    if (u && !safeUrl(u)) return toast('الرابط مش صحيح');
    if (await shootPatch(sh, 'ideas', 'add', { title: t || 'مرجع', url: safeUrl(u) || null })) { if (u && typeof previewFor === 'function') previewFor(safeUrl(u)); rer(); }
  };
  $$('[data-toshot]', root).forEach(b => b.onclick = async () => {
    const x = (sh.ideas || []).find(i => i.id === b.dataset.toshot); if (!x) return;
    b.disabled = true;
    const it = x.item_id && S.items.find(c => c.id === x.item_id);
    const ok = await shootPatch(sh, 'shots', 'add', { title: x.title, note: x.url || x.note || '', item_id: x.item_id || null, type: it ? it.type : 'reel', product_ids: it ? (it.product_ids || []) : [] });
    if (ok) { await shootPatch(sh, 'ideas', 'update', { shot: true }, x.id); toast('اتضافت للشوت ليست'); rer(); }
  });
  const fc = $('#idFromCards'); if (fc) fc.onclick = () => pickIdeaCards(sh);

  // shots
  $$('[data-shot]', root).forEach(el => el.addEventListener('change', async () => {
    const x = (sh.shots || []).find(s => s.id === el.dataset.shot); if (!x) return;
    const k = el.dataset.k, v = el.value.trim();
    if (k === 'title' && !v) { el.value = x.title || ''; return; }
    if (await shootPatch(sh, 'shots', 'update', { [k]: v || null }, x.id)) toast('تم الحفظ', 900);
  }));
  $$('[data-shdone]', root).forEach(b => b.onclick = async () => {
    const x = (sh.shots || []).find(s => s.id === b.dataset.shdone); if (!x) return;
    if (await shootPatch(sh, 'shots', 'update', { done: !x.done }, x.id)) rer();
  });
  $$('[data-shsel]', root).forEach(b => b.onclick = () => { const set = S._shotSel.ids, id = b.dataset.shsel; set.has(id) ? set.delete(id) : set.add(id); rer(); });
  $$('[data-shmove]', root).forEach(b => b.onclick = async () => { if (await shootPatch(sh, 'shots', 'move', { dir: +b.dataset.dir }, b.dataset.shmove)) rer(); });
  $$('[data-shprod]', root).forEach(b => b.onclick = async () => {
    const x = (sh.shots || []).find(s => s.id === b.dataset.shprod); if (!x) return;
    const ids = await pickProducts(x.product_ids || [], 'القطع في اللقطة دي'); if (ids === null) return;
    if (await shootPatch(sh, 'shots', 'update', { product_ids: ids }, x.id)) rer();
  });
  const sa = $('#shotAdd'), sn = $('#shotNew');
  if (sa) { const add = async () => { const t = sn.value.trim(); if (!t) return sn.focus(); sa.disabled = true; if (await shootPatch(sh, 'shots', 'add', { title: t, type: 'reel', done: false })) { rer(); setTimeout(() => $('#shotNew') && $('#shotNew').focus(), 50); } else sa.disabled = false; }; sa.onclick = add; sn.onkeydown = e => { if (e.key === 'Enter') add(); }; }
  const mk = $('#mkCards'); if (mk) mk.onclick = () => makeCards(sh);

  // call sheet
  const cw = $('#cwAdd');
  if (cw) cw.onclick = async () => {
    const m = $('#cwM').value, n = $('#cwN').value.trim(), r = $('#cwR').value.trim(), p = $('#cwP').value.trim();
    if (!m && !n) return $('#cwN').focus();
    if (await shootPatch(sh, 'crew', 'add', { member_id: m || null, name: m ? nameOf(m) : n, role: r, phone: p })) rer();
  };
  const ea = $('#eqAdd'), en = $('#eqNew');
  if (ea) { const add = async () => { const t = en.value.trim(); if (!t) return en.focus(); if (await shootPatch(sh, 'equipment', 'add', { title: t, done: false })) { rer(); setTimeout(() => $('#eqNew') && $('#eqNew').focus(), 50); } }; ea.onclick = add; en.onkeydown = e => { if (e.key === 'Enter') add(); }; }
  $$('[data-eqdone]', root).forEach(b => b.onclick = async () => { const x = (sh.equipment || []).find(e => e.id === b.dataset.eqdone); if (x && await shootPatch(sh, 'equipment', 'update', { done: !x.done }, x.id)) rer(); });

  // budget
  const bg = $('#bgAdd');
  if (bg) bg.onclick = async () => {
    const l = $('#bgL').value.trim(), a = +$('#bgA').value;
    if (!l) return $('#bgL').focus();
    const lines = [...(S.shootBudget[sh.id].lines || []), { id: uid(), label: l, note: $('#bgN').value.trim(), amount: isFinite(a) ? a : 0, by: S.me.id, at: new Date().toISOString() }];
    if (await saveBudget(sh, lines)) rer();
  };
  $$('[data-bgrm]', root).forEach(b => b.onclick = async () => { if (!confirm('حذف البند؟')) return; if (await saveBudget(sh, (S.shootBudget[sh.id].lines || []).filter(l => l.id !== b.dataset.bgrm))) rer(); });

  // footer actions
  $$('[data-sha]', root).forEach(b => b.onclick = async () => {
    const a = b.dataset.sha;
    if (a.startsWith('to:')) return moveShoot(sh, a.slice(3));
    if (a === 'submit') {
      if (!(sh.shots || []).length && !confirm('الشوت ليست فاضية. تبعت للموافقة برضه؟')) return;
      if (await shootUpdate(sh, { submitted_at: new Date().toISOString(), submitted_by: S.me.id, changes_note: null }, true)) { push(approverIds(), '📸 خطة تصوير للموافقة', sh.title); toast('اتبعتت للموافقة'); rer(); renderAllBgShoot(); }
    } else if (a === 'approve') {
      if (await shootUpdate(sh, { approved_at: new Date().toISOString() }, true)) { push([sh.owner, sh.submitted_by], '✅ خطة التصوير اتوافق عليها', sh.title); toast('تمت الموافقة'); rer(); renderAllBgShoot(); }
    } else if (a === 'changes') {
      const note = prompt('إيه التعديلات المطلوبة؟'); if (!note || !note.trim()) return;
      if (await shootUpdate(sh, { changes_note: note.trim(), submitted_at: null }, true)) { push([sh.owner, sh.submitted_by], '✏️ تعديلات على خطة التصوير', sh.title + ' — ' + note.trim()); toast('اتبعت طلب التعديل'); rer(); renderAllBgShoot(); }
    }
  });
}

async function makeCards(sh) {
  const ids = [...(S._shotSel && S._shotSel.id === sh.id ? S._shotSel.ids : [])].filter(id => (sh.shots || []).find(x => x.id === id && !x.made_item));
  if (!ids.length) return toast('اختار لقطة واحدة على الأقل');
  const noOwner = ids.filter(id => !(sh.shots.find(x => x.id === id) || {}).owner).length;
  if (noOwner && !confirm(noOwner + ' لقطة من غير مسؤول مونتاج. تكمل؟')) return;
  const btn = $('#mkCards'); if (btn) btn.disabled = true;
  const { data, error } = await sb.rpc('hq_shoot_make_cards', { p_shoot: sh.id, p_shot_ids: ids });
  if (error) { if (btn) btn.disabled = false; console.error(error); return toast(/needs_approval/.test(error.message) ? 'الخطة محتاجة موافقة الأول' : 'تعذر عمل الكروت'); }
  const made = data || [];
  const byOwner = {};
  made.forEach(m => { if (m.owner) (byOwner[m.owner] = byOwner[m.owner] || []).push(m.title); });
  Object.entries(byOwner).forEach(([o, titles]) => push([o], '🎬 مونتاج جديد عليك من التصوير', sh.title + ': ' + titles.slice(0, 3).join('، ') + (titles.length > 3 ? ' +' + (titles.length - 3) : '')));
  S._shotSel = null;
  await Promise.all([loadItems(), loadShoots()]);
  const fresh = shootById(sh.id) || sh;
  S.shootTab[sh.id] = 'content';
  toast('اتعمل ' + made.length + ' كارت في «مونتاج»');
  renderShoot(fresh); renderAllBgShoot();
}

/* Pick «فكرة» cards to bring into a shoot plan as ideas */
function pickIdeaCards(sh) {
  const taken = new Set((sh.ideas || []).map(x => x.item_id).filter(Boolean));
  const list = S.items.filter(i => i.stage === 'idea' && !taken.has(i.id) && (!i.shoot_id || i.shoot_id === sh.id));
  const ov = stackOverlay('<div class="sh"><b class="grow">ضيف من كروت «فكرة»</b><button class="btn ghost sm" data-close>' + ic('x') + '</button></div><div class="sb">' +
    (list.length ? '<div class="ppick">' + list.map(i => '<button class="pprow" data-pick="' + i.id + '"><span class="pth" style="background-image:url(\'' + esc(i.ref_thumb || productThumb(i) || '') + '\')"></span><span class="grow"><b dir="auto">' + esc(i.title) + '</b><span class="muted small">' + (TYPES[i.type] || '') + '</span></span><i>' + ic('check', 14) + '</i></button>').join('') + '</div>' : '<div class="empty">مفيش كروت «فكرة» متاحة</div>') +
    '</div><div class="sf"><button class="btn pri" id="pkGo">إضافة المختار</button></div>');
  const sel = new Set();
  $$('[data-pick]', ov).forEach(b => b.onclick = () => { const id = b.dataset.pick; sel.has(id) ? sel.delete(id) : sel.add(id); b.classList.toggle('on', sel.has(id)); });
  $('#pkGo', ov).onclick = async () => {
    if (!sel.size) return ov.remove();
    for (const id of sel) { const it = S.items.find(i => i.id === id); if (!it) continue; await addIdeaCardToShoot(sh, it, true); }
    ov.remove(); toast('اتضافت ' + sel.size + ' فكرة'); renderShoot(sh);
  };
}
async function addIdeaCardToShoot(sh, it, quiet) {
  const ok = await shootPatch(sh, 'ideas', 'add', { title: it.title, url: it.ref_url || null, note: it.brief ? it.brief.slice(0, 300) : null, item_id: it.id });
  if (ok) await updateItem(it.id, { shoot_id: sh.id }, true);
  if (ok && !quiet) toast('اتضافت لخطة «' + sh.title + '»');
  return ok;
}
/* From anywhere: choose an open shoot plan (or start a new one) */
function chooseShoot(title, onPick) {
  const open = S.shoots.filter(s => SHI[s.stage] <= SHI.shoot_day);
  const ov = stackOverlay('<div class="sh"><b class="grow">' + esc(title) + '</b><button class="btn ghost sm" data-close>' + ic('x') + '</button></div><div class="sb"><div class="ppick">' +
    open.map(s => '<button class="pprow" data-shp="' + s.id + '"><span class="grow"><b dir="auto">' + esc(s.title) + '</b><span class="muted small">' + SHM[s.stage].n + (s.shoot_date ? ' · ' + fmtShort(s.shoot_date) : '') + '</span></span></button>').join('') +
    '</div>' + (open.length ? '' : '<div class="empty">مفيش خطط تصوير مفتوحة</div>') + '<button class="btn" id="shpNew" style="width:100%;margin-top:10px">+ خطة تصوير جديدة</button></div>');
  $$('[data-shp]', ov).forEach(b => b.onclick = async () => { ov.remove(); await onPick(shootById(b.dataset.shp)); });
  $('#shpNew', ov).onclick = () => { ov.remove(); closeSheet(); newShoot(); };
}

VIEWS.shoots = viewShoots;
