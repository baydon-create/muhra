'use strict';
/* Tasks, briefs and team chat — everything the old Tasks app did, inside the hub. */

const STAT = ['To Do', 'In Progress', 'Review', 'Done'];
const STAT_AR = { 'To Do': 'لسه', 'In Progress': 'شغال', 'Review': 'مراجعة', 'Done': 'خلص' };
const STAT_CLS = { 'To Do': '', 'In Progress': 'info', 'Review': 'soon', 'Done': 'okp' };
const PRIO = ['Low', 'Medium', 'High', 'Urgent'];
const PRIO_AR = { Low: 'منخفضة', Medium: 'متوسطة', High: 'عالية', Urgent: 'عاجلة' };
const PRIO_CLS = { Low: 'okp', Medium: '', High: 'soon', Urgent: 'late' };
const URG = ['Urgent', 'High', 'Normal', 'Low'];
const URG_AR = { Urgent: 'عاجل', High: 'مهم', Normal: 'عادي', Low: 'بسيط' };
const URG_CLS = { Urgent: 'late', High: 'soon', Normal: 'okp', Low: '' };
const statusAr = s => STAT_AR[s] || s;
const isOD = t => t.deadline && t.status !== 'Done' && new Date(t.deadline + (String(t.deadline).length === 10 ? 'T23:59:59' : '')) < new Date();

/* ───────── DATA ───────── */
async function loadTasks() {
  const { data, error } = await sb.from('tasks').select('*, comments(*), edit_requests(*)').order('created_at', { ascending: false });
  if (error) { console.error(error); return; }
  (data || []).forEach(t => { (t.comments || []).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))); });
  S.tasks = data || [];
}
async function loadBriefs() {
  const { data, error } = await sb.from('maha_briefs').select('*').order('created_at', { ascending: false }).limit(200);
  if (!error) S.briefs = data || [];
}
async function loadChat() {
  const { data, error } = await sb.from('chat').select('*').order('created_at', { ascending: false }).limit(300);
  if (!error) S.chat = (data || []).reverse();
}
function markChatSeen() { S.chatSeen = Date.now(); lsS('hq.chatSeen', S.chatSeen); }
const others = () => S.team.map(m => m.id).filter(id => id !== S.me.id);

/* ───────── TASKS: list ───────── */
function taskCard(t, opts = {}) {
  const asg = assigneesOf(t), subs = t.subtasks || [], sd = subs.filter(s => s.completed).length;
  const content = t.content_id ? S.items.find(i => i.id === t.content_id) : null;
  const counts = [
    (t.comments || []).length && '💬 ' + t.comments.length,
    subs.length && '☑ ' + sd + '/' + subs.length,
    (t.signed_by || []).length && '✍️ ' + t.signed_by.length,
    (t.edit_requests || []).length && '📝 ' + t.edit_requests.length,
    (t.attachments || []).length && '🖼 ' + t.attachments.length,
    (t.links || []).length && '🔗 ' + t.links.length,
    ((t.instructions && t.instructions.voices) || []).length && '🎙 ' + t.instructions.voices.length
  ].filter(Boolean);
  return '<div class="card tcard' + (t.pinned ? ' pinned' : '') + '" data-task="' + t.id + '">' +
    '<div class="row" style="align-items:flex-start"><div class="grow">' + (t.pinned ? '<div class="pin">📌 مثبتة</div>' : '') +
    '<div class="t" dir="auto">' + esc(t.title) + '</div>' +
    (!opts.compact && t.description ? '<div class="muted small clamp2" dir="auto">' + esc(t.description) + '</div>' : '') + '</div>' +
    '<span class="pill ' + (PRIO_CLS[t.priority] || '') + '">' + (PRIO_AR[t.priority] || t.priority || '') + '</span></div>' +
    '<div class="meta" style="margin-top:7px"><span class="pill ' + STAT_CLS[t.status] + '">' + statusAr(t.status) + '</span>' +
    (t.deadline ? '<span class="pill ' + (isOD(t) ? 'late' : '') + '">' + (isOD(t) ? '⚠️ ' : '📅 ') + fmtShort(t.deadline) + '</span>' : '') +
    (content ? '<span class="pill">🎬 ' + esc(content.title.slice(0, 24)) + '</span>' : '') +
    counts.map(c => '<span class="cnt">' + c + '</span>').join('') +
    '<span class="grow"></span><span class="avs">' + asg.slice(0, 4).map(id => av(id, false, true)).join('') + '</span></div></div>';
}
function viewTasks(v) {
  const f = S.taskFilter, me = S.me.id;
  if (S.routeArg && S.routeArg !== S._taskArgDone) { S._taskArgDone = S.routeArg; setTimeout(() => openTask(S.routeArg), 0); }
  const mine = S.tasks.filter(t => assigneesOf(t).includes(me));
  const k = [
    ['mine', 'مهامي', mine.filter(t => t.status !== 'Done').length],
    ['urgent', 'عاجلة', S.tasks.filter(t => t.priority === 'Urgent' && t.status !== 'Done').length],
    ['late', 'متأخرة', S.tasks.filter(isOD).length],
    ['done', 'خلصت', S.tasks.filter(t => t.status === 'Done').length]
  ];
  let list = S.tasks.filter(t =>
    (f.status === 'All' || t.status === f.status) &&
    (f.member === 'All' || assigneesOf(t).includes(f.member)) &&
    (!f.mine || assigneesOf(t).includes(me)) &&
    (!f.quick || (f.quick === 'urgent' ? t.priority === 'Urgent' && t.status !== 'Done' : f.quick === 'late' ? isOD(t) : f.quick === 'done' ? t.status === 'Done' : true)));
  list = list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.status === 'Done') - (b.status === 'Done') || String(a.deadline || '9999').localeCompare(String(b.deadline || '9999')));
  v.innerHTML = '<h1 class="ptitle">☑️ المهام</h1><div class="kpis k4">' + k.map(([key, l, n]) => '<button class="card kpi kbtn' + ((key === 'mine' && f.mine) || f.quick === key ? ' on' : '') + '" data-q="' + key + '"><div class="v' + (key === 'late' && n ? ' bad' : '') + '">' + n + '</div><div class="l">' + l + '</div></button>').join('') + '</div>' +
    '<div class="chips" style="margin-top:12px">' + ['All', ...STAT].map(s => '<button class="chip' + (f.status === s ? ' on' : '') + '" data-st="' + s + '">' + (s === 'All' ? 'الكل' : statusAr(s)) + ' <span class="c">' + (s === 'All' ? S.tasks.length : S.tasks.filter(t => t.status === s).length) + '</span></button>').join('') + '</div>' +
    '<div class="toolbar"><select class="mini" id="tMember"><option value="All">كل الفريق</option>' + S.team.map(m => '<option value="' + esc(m.id) + '"' + (f.member === m.id ? ' selected' : '') + '>' + esc(m.name) + '</option>').join('') + '</select>' +
    (isAdmin() ? '<button class="btn sm pri" id="tNew">+ مهمة جديدة</button>' : '') + '<span class="muted small" style="margin-inline-start:auto">' + list.length + ' مهمة</span></div>' +
    (list.length ? '<div class="list">' + list.map(t => taskCard(t)).join('') + '</div>' : '<div class="empty">مفيش مهام هنا</div>');
  $$('[data-q]', v).forEach(b => b.onclick = () => { const q = b.dataset.q; if (q === 'mine') { f.mine = !f.mine; f.quick = null; } else { f.quick = f.quick === q ? null : q; f.mine = false; } renderAll(); });
  $$('[data-st]', v).forEach(b => b.onclick = () => { f.status = b.dataset.st; renderAll(); });
  $('#tMember', v).onchange = e => { f.member = e.target.value; renderAll(); };
  const tn = $('#tNew', v); if (tn) tn.onclick = () => newTask();
}

/* ───────── TASKS: create / update ───────── */
async function updateTask(id, patch, opts = {}) {
  const t = S.tasks.find(x => x.id === id); if (t) Object.assign(t, patch);
  const { error } = await sb.from('tasks').update(patch).eq('id', id);
  if (error) { toast('لم يتم الحفظ'); console.error(error); return false; }
  if (t && 'status' in patch) push([...new Set([...assigneesOf(t), ...others()])], '☑️ ' + t.title, firstName(S.me.id) + ' غيّر الحالة إلى «' + statusAr(patch.status) + '»');
  if (!opts.silent) renderAll();
  return true;
}
function newTask(pre = {}) {
  const sel = new Set(pre.assigned_to || []);
  const root = sheet('<div class="sh"><b class="grow">مهمة جديدة</b><button class="btn ghost sm" id="x">✕</button></div><div class="sb">' +
    '<label class="lb">العنوان *</label><input class="inp" id="ntT" dir="auto" value="' + esc(pre.title || '') + '" placeholder="عنوان المهمة">' +
    '<label class="lb">التفاصيل</label><textarea class="inp" id="ntD" dir="auto" placeholder="التفاصيل…">' + esc(pre.description || '') + '</textarea>' +
    '<div class="g2"><div><label class="lb">الأولوية</label><select class="inp" id="ntP">' + PRIO.map(p => '<option value="' + p + '"' + (p === (pre.priority || 'Medium') ? ' selected' : '') + '>' + PRIO_AR[p] + '</option>').join('') + '</select></div>' +
    '<div><label class="lb">الموعد</label><input type="date" class="inp" id="ntDl" value="' + esc(pre.deadline || '') + '"></div></div>' +
    '<label class="lb">المحتوى المرتبط (اختياري)</label><select class="inp" id="ntC"><option value="">— بدون —</option>' + S.items.filter(i => !['posted'].includes(i.stage)).map(i => '<option value="' + i.id + '"' + (pre.content_id === i.id ? ' selected' : '') + '>' + esc(i.title) + '</option>').join('') + '</select>' +
    '<label class="lb">مسؤول عنها * (واحد أو أكتر)</label><div class="toggles" id="ntA">' + S.team.map(m => '<button class="tg' + (sel.has(m.id) ? ' on' : '') + '" data-a="' + esc(m.id) + '">' + av(m.id, false, true) + esc(firstName(m.id)) + '</button>').join('') + '</div>' +
    '</div><div class="sf"><button class="btn pri" id="ntSave">إنشاء المهمة</button></div>');
  $('#x').onclick = closeSheet;
  $$('[data-a]', root).forEach(b => b.onclick = () => { b.classList.toggle('on'); sel.has(b.dataset.a) ? sel.delete(b.dataset.a) : sel.add(b.dataset.a); });
  $('#ntSave').onclick = async () => {
    const title = $('#ntT').value.trim();
    if (!title) return toast('اكتب عنوان المهمة');
    if (!sel.size) return toast('اختار شخص واحد على الأقل');
    $('#ntSave').disabled = true;
    const row = { title, description: $('#ntD').value.trim() || null, priority: $('#ntP').value, deadline: $('#ntDl').value || null, assigned_to: [...sel],
      created_by: S.me.id, status: 'To Do', signed_by: [], attachments: [], links: [], instructions: { text: '', voices: [] }, subtasks: [], content_id: $('#ntC').value || null };
    const { data, error } = await sb.from('tasks').insert(row).select('*, comments(*), edit_requests(*)').single();
    if (error) { $('#ntSave').disabled = false; console.error(error); return toast('تعذر إنشاء المهمة'); }
    S.tasks.unshift(data);
    const asg = [...sel].filter(id => id !== S.me.id);
    push(asg, '☑️ مهمة جديدة عليك', firstName(S.me.id) + ': ' + title);
    push(others().filter(id => !asg.includes(id)), '☑️ مهمة جديدة', firstName(S.me.id) + ' أنشأ: ' + title);
    if (pre.brief_id) { await sb.from('maha_briefs').update({ task_id: data.id }).eq('id', pre.brief_id); const b = S.briefs.find(x => x.id === pre.brief_id); if (b) b.task_id = data.id; }
    closeSheet(); toast('تم إنشاء المهمة ✓'); renderAll();
    openTask(data.id);
  };
  setTimeout(() => $('#ntT') && $('#ntT').focus(), 60);
}

/* ───────── TASKS: detail ───────── */
function openTask(id) {
  const t = S.tasks.find(x => x.id === id);
  if (!t) { toast('المهمة غير موجودة'); return; }
  S.openTaskId = id; S.openId = null; S._taskEdit = false;
  if (location.hash !== '#task=' + id) history.replaceState(null, '', '#task=' + id);
  renderTaskSheet(t);
}
function refreshTaskLive() {
  const t = S.tasks.find(x => x.id === S.openTaskId); if (!t || S._subOpen) return;
  const ae = document.activeElement;
  if (S._taskEdit || (ae && $('#sheetRoot').contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) || Rec.mr) return;
  const sc = $('#sheetRoot .sb'), top = sc ? sc.scrollTop : 0;
  renderTaskSheet(t);
  const sc2 = $('#sheetRoot .sb'); if (sc2) sc2.scrollTop = top;
}
function renderTaskSheet(t) {
  const me = S.me.id, admin = isAdmin(), asg = assigneesOf(t);
  const canStatus = admin || asg.includes(me), signed = (t.signed_by || []).includes(me);
  const canSign = asg.includes(me) && !signed && t.status === 'Done';
  const content = t.content_id ? S.items.find(i => i.id === t.content_id) : null;
  const voices = (t.instructions && t.instructions.voices) || [];
  const subs = t.subtasks || [], sd = subs.filter(s => s.completed).length;
  let body;
  if (S._taskEdit && admin) {
    body = '<label class="lb">العنوان</label><input class="inp" id="eT" dir="auto" value="' + esc(t.title) + '">' +
      '<label class="lb">التفاصيل</label><textarea class="inp" id="eD" dir="auto">' + esc(t.description || '') + '</textarea>' +
      '<div class="g2"><div><label class="lb">الأولوية</label><select class="inp" id="eP">' + PRIO.map(p => '<option value="' + p + '"' + (p === t.priority ? ' selected' : '') + '>' + PRIO_AR[p] + '</option>').join('') + '</select></div>' +
      '<div><label class="lb">الموعد</label><input type="date" class="inp" id="eDl" value="' + esc(t.deadline ? String(t.deadline).slice(0, 10) : '') + '"></div></div>' +
      '<label class="lb">المحتوى المرتبط</label><select class="inp" id="eC"><option value="">— بدون —</option>' + S.items.map(i => '<option value="' + i.id + '"' + (t.content_id === i.id ? ' selected' : '') + '>' + esc(i.title) + '</option>').join('') + '</select>' +
      '<label class="lb">مسؤول عنها</label><div class="toggles" id="eA">' + S.team.map(m => '<button class="tg' + (asg.includes(m.id) ? ' on' : '') + '" data-a="' + esc(m.id) + '">' + av(m.id, false, true) + esc(firstName(m.id)) + '</button>').join('') + '</div>' +
      '<div class="row" style="margin-top:16px"><button class="btn pri" id="eSave">حفظ</button><button class="btn" id="eCancel">إلغاء</button></div>';
  } else {
    body = '<h2 class="ttl" dir="auto">' + esc(t.title) + '</h2><div class="muted small">' + av(t.created_by, false, true) + ' ' + esc(firstName(t.created_by)) + ' · ' + fmtTime(t.created_at) + '</div>' +
      '<div class="meta" style="margin:10px 0"><span class="pill ' + PRIO_CLS[t.priority] + '">أولوية ' + (PRIO_AR[t.priority] || '') + '</span>' + (t.deadline ? '<span class="pill ' + (isOD(t) ? 'late' : '') + '">📅 ' + fmtShort(t.deadline) + (isOD(t) ? ' · متأخرة' : '') + '</span>' : '') +
      (content ? '<button class="pill" data-gocontent="' + content.id + '">🎬 ' + esc(content.title) + '</button>' : '') + '</div>' +
      (t.description ? '<div class="desc" dir="auto">' + richText(t.description) + '</div>' : '') +
      '<div class="sectitle">المسؤولين</div><div class="row wrap">' + asg.map(id => '<span class="person">' + av(id, false, true) + esc(nameOf(id)) + '</span>').join('') + '</div>' +
      '<div class="sectitle">الحالة</div><div class="stepper">' + STAT.map(s => '<button data-status="' + s + '" class="' + (t.status === s ? 'cur' : '') + '"' + (canStatus ? '' : ' disabled') + '>' + statusAr(s) + '</button>').join('') + '</div>' +
      ((t.signed_by || []).length ? '<div class="sectitle">وقّع عليها</div><div class="row wrap">' + t.signed_by.map(id => '<span class="person">' + av(id, false, true) + esc(firstName(id)) + ' ✓</span>').join('') + '</div>' : '') +
      (canSign ? '<button class="btn ok" id="tSign" style="margin-top:10px;width:100%">✍️ توقيع واعتماد المهمة</button>' : '') +
      (signed ? '<div class="alert ok">✓ إنت وقّعت على المهمة دي</div>' : '') +
      (!admin ? '<div style="margin-top:12px"><button class="btn sm" id="tReqBtn">📝 طلب تعديل</button><div id="tReqBox" class="hidden" style="margin-top:8px"><textarea class="inp" id="tReq" dir="auto" placeholder="إيه اللي محتاج يتغير؟"></textarea><button class="btn pri sm" id="tReqSend" style="margin-top:6px">إرسال الطلب</button></div></div>' : '') +
      (admin && (t.edit_requests || []).length ? '<div class="sectitle">📝 طلبات تعديل (' + t.edit_requests.length + ')</div>' + t.edit_requests.map(r => '<div class="alert warn"><b>' + esc(firstName(r.author)) + '</b> · ' + fmtTime(r.created_at) + '<div dir="auto">' + richText(r.note) + '</div></div>').join('') : '') +
      // instructions
      '<div class="sectitle">📋 التعليمات</div><textarea class="inp" id="tInstr" dir="auto" placeholder="اكتب تعليمات المهمة…">' + esc((t.instructions && t.instructions.text) || '') + '</textarea>' +
      '<button class="btn sm pri hidden" id="tInstrSave" style="margin-top:6px">حفظ التعليمات</button>' +
      voices.map(vc => '<div class="voice">🎙 <span class="muted small">' + esc(firstName(vc.uploadedBy)) + ' · ' + fmtTime(vc.uploadedAt) + (vc.duration ? ' · ' + fmtSec(vc.duration) : '') + '</span>' +
        ((admin || vc.uploadedBy === me) ? '<button class="xbtn" data-delvoice="' + esc(vc.id) + '">✕</button>' : '') + '<audio controls preload="none" src="' + esc(vc.url) + '"></audio></div>').join('') +
      '<button class="btn sm" id="tRec" style="margin-top:8px">🎙 تسجيل ملاحظة صوتية</button>' +
      // attachments
      '<div class="sectitle">🖼 الصور (' + (t.attachments || []).length + ')</div><div class="files">' + (t.attachments || []).map(a =>
        '<div class="att"><a class="file" href="' + esc(a.url || a.dataUrl) + '" target="_blank" rel="noopener" style="background-image:url(\'' + esc(a.url || a.dataUrl) + '\')">' + ((admin || a.uploadedBy === me) ? '<button class="x" data-delatt="' + esc(a.id) + '">×</button>' : '') + '</a>' +
        '<div class="note" dir="auto">' + (a.note ? esc(a.note) : '') + ((admin || a.uploadedBy === me) ? ' <button class="linkbtn" data-attnote="' + esc(a.id) + '">' + (a.note ? '✎' : '+ ملاحظة') + '</button>' : '') + '</div></div>').join('') +
      '<label class="file add" id="tAddImg">+</label></div>' +
      // links
      '<div class="sectitle">🔗 روابط ومصادر (' + (t.links || []).length + ')</div>' + (t.links || []).map(l => '<div class="lrow"><a href="' + esc(safeUrl(l.url)) + '" target="_blank" rel="noopener"><b>' + esc(l.name) + '</b><span dir="ltr">' + esc(l.url) + '</span></a>' + ((admin || l.addedBy === me) ? '<button class="xbtn" data-dellink="' + esc(l.id) + '">✕</button>' : '') + '</div>').join('') +
      '<div class="linkrow" style="margin-top:6px"><input class="inp" id="lkN" placeholder="اسم الرابط" style="max-width:40%"><input class="inp" id="lkU" placeholder="https://…" dir="ltr"><button class="btn" id="lkAdd">إضافة</button></div>' +
      // subtasks
      '<div class="sectitle">☑ مهام فرعية (' + sd + '/' + subs.length + ')</div>' + (subs.length ? '<div class="prog"><i style="width:' + Math.round(sd / subs.length * 100) + '%"></i></div>' : '') +
      subs.map((s, i) => { const can = admin || s.assignedTo === me; return '<div class="srow2"><span class="muted small">' + (i + 1) + '</span>' +
        '<button class="chk' + (s.completed ? ' on' : '') + '" data-subtoggle="' + esc(s.id) + '"' + (can ? '' : ' disabled title="المسؤول عنها فقط"') + '>' + (s.completed ? '✓' : '') + '</button>' +
        '<span class="grow' + (s.completed ? ' done' : '') + '" dir="auto">' + esc(s.title) + (s.assignedTo ? ' <span class="muted small">· ' + esc(firstName(s.assignedTo)) + '</span>' : '') + '</span>' +
        '<button class="btn sm ghost" data-subthread="' + esc(s.id) + '">💬 ' + ((s.comments || []).length || '') + '</button>' + (admin ? '<button class="xbtn" data-subdel="' + esc(s.id) + '">✕</button>' : '') + '</div>'; }).join('') +
      (admin ? '<div class="linkrow" style="margin-top:6px"><input class="inp" id="stT" dir="auto" placeholder="مهمة فرعية جديدة…"><select class="inp" id="stA" style="max-width:38%"><option value="">بدون مسؤول</option>' + S.team.map(m => '<option value="' + esc(m.id) + '">' + esc(firstName(m.id)) + '</option>').join('') + '</select><button class="btn" id="stAdd">إضافة</button></div>' : '') +
      // linked content
      (!content ? '<div class="sectitle">🎬 المحتوى</div><button class="btn sm" id="tToContent">+ إنشاء كارت محتوى من المهمة دي</button>' : '') +
      // comments
      '<div class="sectitle">💬 التعليقات (' + (t.comments || []).length + ')</div>' + (t.comments || []).map(c => {
        const likes = c.likes || [], mine = c.author === me;
        return '<div class="cmt">' + av(c.author) + '<div class="bub"><div class="row"><span class="who">' + esc(firstName(c.author)) + '</span><span class="tm">' + fmtTime(c.created_at) + (c.edited ? ' · معدّل' : '') + '</span></div>' +
          '<p dir="auto">' + richText(c.text) + '</p><div class="row" style="gap:6px;margin-top:4px"><button class="like' + (likes.includes(me) ? ' on' : '') + '" data-like="' + c.id + '">♥ ' + (likes.length || '') + '</button>' +
          (mine ? '<button class="linkbtn" data-editcmt="' + c.id + '">تعديل</button>' : '') + '</div></div></div>';
      }).join('') +
      composer('tc', 'اكتب تعليق… (@ لذكر شخص)');
  }
  const root = sheet('<div class="sh"><button class="btn ghost sm" id="x">✕</button><span class="pill ' + STAT_CLS[t.status] + '">' + statusAr(t.status) + '</span><span class="grow"></span>' +
    (admin ? '<button class="btn ghost sm" id="tPin" title="تثبيت">' + (t.pinned ? '📌 مثبتة' : '📌') + '</button><button class="btn ghost sm" id="tEdit">✎ تعديل</button><button class="btn ghost sm" id="tDel">🗑</button>' : '') +
    '<button class="btn ghost sm" id="tCopy">🔗</button></div><div class="sb">' + body + '</div>');
  bindTaskSheet(t, root);
}
function composer(key, ph) {
  return '<div class="composer"><button class="btn ghost sm" data-cattach="' + key + '" title="إرفاق">📎</button><textarea class="inp" id="' + key + 'Text" dir="auto" rows="1" placeholder="' + esc(ph) + '"></textarea><button class="btn pri" data-csend="' + key + '">إرسال</button></div>' +
    '<div class="mentions">' + S.team.filter(m => m.id !== S.me.id).map(m => '<button class="mchip" data-mention="' + key + '" data-name="' + esc(firstName(m.id)) + '">@' + esc(firstName(m.id)) + '</button>').join('') + '</div>';
}
function bindComposer(root, key, onSend) {
  const ta = $('#' + key + 'Text', root); if (!ta) return;
  const send = async () => { const txt = ta.value.trim(); if (!txt) return; ta.disabled = true; await onSend(txt); ta.value = ''; ta.disabled = false; };
  $('[data-csend="' + key + '"]', root).onclick = send;
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 700) { e.preventDefault(); send(); } });
  $('[data-cattach="' + key + '"]', root).onclick = async () => {
    const files = await pickFiles('*/*', false); if (!files.length) return;
    toast('جاري الرفع…');
    try { const f = await uploadFile(files[0], 'comments'); ta.value = (ta.value ? ta.value + '\n' : '') + f.url + ' '; ta.focus(); } catch (e) { toast('فشل الرفع'); }
  };
  $$('[data-mention="' + key + '"]', root).forEach(b => b.onclick = () => { ta.value += (ta.value && !/\s$/.test(ta.value) ? ' ' : '') + '@' + b.dataset.name + ' '; ta.focus(); });
}
function bindTaskSheet(t, root) {
  const me = S.me.id, admin = isAdmin();
  $('#x').onclick = closeSheet;
  $('#tCopy').onclick = () => { const u = location.origin + location.pathname + '#task=' + t.id; navigator.clipboard ? navigator.clipboard.writeText(u).then(() => toast('تم نسخ الرابط')) : prompt('الرابط', u); };
  if (admin) {
    $('#tPin').onclick = () => updateTask(t.id, { pinned: !t.pinned });
    $('#tDel').onclick = async () => { if (!confirm('حذف المهمة «' + t.title + '»؟')) return; await sb.from('tasks').delete().eq('id', t.id); S.tasks = S.tasks.filter(x => x.id !== t.id); closeSheet(); renderAll(); toast('تم الحذف'); };
    $('#tEdit').onclick = () => { S._taskEdit = !S._taskEdit; renderTaskSheet(t); };
  }
  if (S._taskEdit) {
    const sel = new Set(assigneesOf(t));
    $$('#eA [data-a]', root).forEach(b => b.onclick = () => { b.classList.toggle('on'); sel.has(b.dataset.a) ? sel.delete(b.dataset.a) : sel.add(b.dataset.a); });
    $('#eCancel').onclick = () => { S._taskEdit = false; renderTaskSheet(t); };
    $('#eSave').onclick = async () => {
      if (!$('#eT').value.trim()) return toast('العنوان مطلوب');
      if (!sel.size) return toast('اختار شخص واحد على الأقل');
      const before = assigneesOf(t);
      S._taskEdit = false;
      await updateTask(t.id, { title: $('#eT').value.trim(), description: $('#eD').value.trim() || null, priority: $('#eP').value, deadline: $('#eDl').value || null, assigned_to: [...sel], content_id: $('#eC').value || null });
      push([...sel].filter(id => !before.includes(id)), '☑️ مهمة جديدة عليك', t.title);
      toast('تم الحفظ ✓'); renderTaskSheet(S.tasks.find(x => x.id === t.id));
    };
    return;
  }
  $$('[data-status]', root).forEach(b => b.onclick = async () => { if (b.dataset.status === t.status) return; await updateTask(t.id, { status: b.dataset.status }); toast('الحالة: ' + statusAr(b.dataset.status)); });
  const sg = $('#tSign'); if (sg) sg.onclick = async () => { await updateTask(t.id, { signed_by: [...(t.signed_by || []), me] }, { silent: true }); push(adminIds(), '✍️ توقيع على مهمة', firstName(me) + ' وقّع على «' + t.title + '»'); renderAll(); toast('تم التوقيع ✓'); };
  const rb = $('#tReqBtn'); if (rb) { rb.onclick = () => $('#tReqBox').classList.toggle('hidden'); $('#tReqSend').onclick = async () => {
    const note = $('#tReq').value.trim(); if (!note) return;
    await sb.from('edit_requests').insert({ task_id: t.id, author: me, note });
    push(adminIds(), '📝 طلب تعديل', firstName(me) + ' على «' + t.title + '»: ' + note.slice(0, 80));
    await loadTasks(); renderAll(); toast('تم إرسال الطلب');
  }; }
  // instructions
  const ins = $('#tInstr'), insSave = $('#tInstrSave');
  ins.oninput = () => insSave.classList.toggle('hidden', ins.value === ((t.instructions && t.instructions.text) || ''));
  insSave.onclick = async () => { await updateTask(t.id, { instructions: { text: ins.value, voices: (t.instructions && t.instructions.voices) || [] } }, { silent: true }); insSave.classList.add('hidden'); toast('تم الحفظ ✓'); };
  const recBtn = $('#tRec');
  recBtn.onclick = async () => {
    if (!Rec.mr) {
      try { await recStart(s => { recBtn.textContent = '⏹ إيقاف وحفظ · ' + fmtSec(s); }); recBtn.classList.add('bad'); }
      catch { toast('اسمح باستخدام الميكروفون'); }
    } else {
      recBtn.disabled = true; recBtn.textContent = 'جاري الحفظ…';
      try {
        const f = await recStop(t.id);
        const cur = S.tasks.find(x => x.id === t.id) || t;
        const voices = [...((cur.instructions && cur.instructions.voices) || []), { id: uid(), url: f.url, path: f.path, uploadedBy: me, uploadedAt: new Date().toISOString(), duration: f.duration }];
        await updateTask(t.id, { instructions: { text: (cur.instructions && cur.instructions.text) || '', voices } });
        toast('تم حفظ الملاحظة الصوتية ✓');
      } catch { toast('فشل حفظ الصوت'); renderTaskSheet(t); }
    }
  };
  $$('[data-delvoice]', root).forEach(b => b.onclick = async () => {
    if (!confirm('حذف الملاحظة الصوتية؟')) return;
    const vs = ((t.instructions && t.instructions.voices) || []); const v = vs.find(x => x.id === b.dataset.delvoice);
    if (v && v.path) sb.storage.from(BUCKET).remove([v.path]);
    await updateTask(t.id, { instructions: { text: (t.instructions && t.instructions.text) || '', voices: vs.filter(x => x.id !== b.dataset.delvoice) } });
  });
  // images
  $('#tAddImg').onclick = async () => {
    const files = (await pickFiles('image/*', true)).filter(f => f.size <= 10 * 1024 * 1024);
    if (!files.length) return;
    toast('جاري الرفع…');
    const add = [];
    for (const f of files) { try { const u = await uploadFile(f, t.id); add.push({ id: uid(), url: u.url, path: u.path, name: f.name, uploadedBy: me, uploadedAt: new Date().toISOString(), note: '' }); } catch { toast('فشل رفع ' + f.name); } }
    const cur = S.tasks.find(x => x.id === t.id) || t;
    await updateTask(t.id, { attachments: [...(cur.attachments || []), ...add] }); toast('تم الرفع ✓');
  };
  $$('[data-delatt]', root).forEach(b => b.onclick = async e => {
    e.preventDefault(); e.stopPropagation(); if (!confirm('حذف الصورة؟')) return;
    const a = (t.attachments || []).find(x => x.id === b.dataset.delatt); if (a && a.path) sb.storage.from(BUCKET).remove([a.path]);
    await updateTask(t.id, { attachments: (t.attachments || []).filter(x => x.id !== b.dataset.delatt) });
  });
  $$('[data-attnote]', root).forEach(b => b.onclick = async () => {
    const a = (t.attachments || []).find(x => x.id === b.dataset.attnote); const n = prompt('ملاحظة على الصورة:', (a && a.note) || ''); if (n === null) return;
    await updateTask(t.id, { attachments: (t.attachments || []).map(x => x.id === b.dataset.attnote ? { ...x, note: n.trim() } : x) });
  });
  // links
  $('#lkAdd').onclick = async () => {
    const n = $('#lkN').value.trim(), u = safeUrl($('#lkU').value.trim());
    if (!n) return toast('اكتب اسم الرابط'); if (!u) return toast('الرابط لازم يبدأ بـ https');
    await updateTask(t.id, { links: [...(t.links || []), { id: uid(), name: n, url: u, addedBy: me, addedAt: new Date().toISOString() }] });
  };
  $$('[data-dellink]', root).forEach(b => b.onclick = async () => { if (!confirm('حذف الرابط؟')) return; await updateTask(t.id, { links: (t.links || []).filter(l => l.id !== b.dataset.dellink) }); });
  // subtasks
  $$('[data-subtoggle]', root).forEach(b => b.onclick = () => updateTask(t.id, { subtasks: (t.subtasks || []).map(s => s.id === b.dataset.subtoggle ? { ...s, completed: !s.completed } : s) }));
  $$('[data-subdel]', root).forEach(b => b.onclick = () => { if (confirm('حذف المهمة الفرعية؟')) updateTask(t.id, { subtasks: (t.subtasks || []).filter(s => s.id !== b.dataset.subdel) }); });
  $$('[data-subthread]', root).forEach(b => b.onclick = () => openSubThread(t.id, b.dataset.subthread));
  const sa = $('#stAdd'); if (sa) sa.onclick = async () => {
    const title = $('#stT').value.trim(), who = $('#stA').value || null; if (!title) return toast('اكتب عنوان المهمة الفرعية');
    const subs = t.subtasks || [];
    await updateTask(t.id, { subtasks: [...subs, { id: uid(), title, completed: false, assignedTo: who, order: subs.length, createdBy: me, createdAt: new Date().toISOString(), comments: [] }] });
    if (who) push([who], '☑ مهمة فرعية عليك', title + ' — ' + t.title);
  };
  const tc = $('#tToContent'); if (tc) tc.onclick = async () => {
    const it = await createItem({ title: t.title, brief: t.description || null, due_date: t.deadline ? String(t.deadline).slice(0, 10) : null, owner: assigneesOf(t)[0] || me }, { open: false });
    if (it) { await updateTask(t.id, { content_id: it.id }); toast('اتعمل كارت محتوى ✓'); }
  };
  $$('[data-gocontent]', root).forEach(b => b.onclick = () => openItem(b.dataset.gocontent));
  // comments
  $$('[data-like]', root).forEach(b => b.onclick = async () => {
    const c = (t.comments || []).find(x => x.id == b.dataset.like); if (!c) return;
    const likes = c.likes || []; c.likes = likes.includes(me) ? likes.filter(x => x !== me) : [...likes, me];
    await sb.from('comments').update({ likes: c.likes }).eq('id', c.id); renderTaskSheet(t);
  });
  $$('[data-editcmt]', root).forEach(b => b.onclick = async () => {
    const c = (t.comments || []).find(x => x.id == b.dataset.editcmt); const n = prompt('تعديل التعليق:', c.text); if (!n || !n.trim()) return;
    await sb.from('comments').update({ text: n.trim(), edited: true }).eq('id', c.id); await loadTasks(); renderAll();
  });
  bindComposer(root, 'tc', async txt => {
    const { error } = await sb.from('comments').insert({ task_id: t.id, author: me, text: txt, likes: [], edited: false });
    if (error) return toast('لم يتم الإرسال');
    const ment = mentionsIn(txt).filter(id => id !== me);
    push(ment, '💬 ' + firstName(me) + ' ذكرك', '«' + t.title + '»: ' + txt.slice(0, 90));
    push([...new Set([...assigneesOf(t), ...adminIds()])].filter(id => !ment.includes(id)), '💬 تعليق جديد', firstName(me) + ' على «' + t.title + '»: ' + txt.slice(0, 80));
    await loadTasks(); renderAll();
  });
}
/* Subtask evaluation thread: admins post evaluations, the assigned member replies (text, files, voice). */
function openSubThread(taskId, subId) {
  S._subOpen = true;
  const t = S.tasks.find(x => x.id === taskId); const st = (t.subtasks || []).find(s => s.id === subId); if (!st) return;
  const me = S.me.id, admin = isAdmin();
  const can = admin || assigneesOf(t).includes(me) || st.assignedTo === me;
  const cm = st.comments || [];
  const root = sheet('<div class="sh"><button class="btn ghost sm" id="back">→ رجوع</button><b class="grow" dir="auto">' + esc(st.title) + '</b>' + (st.completed ? '<span class="pill okp">✓ خلصت</span>' : '<span class="pill soon">⏳</span>') + '</div><div class="sb">' +
    '<div class="muted small" style="margin:8px 0">' + (st.assignedTo ? av(st.assignedTo, false, true) + ' ' + esc(nameOf(st.assignedTo)) : 'بدون مسؤول') + ' · ' + cm.length + ' تعليق</div>' +
    (cm.length ? cm.map(c => '<div class="cmt">' + av(c.author) + '<div class="bub' + (c.type === 'evaluation' ? ' eval' : '') + '"><div class="row"><span class="who">' + esc(firstName(c.author)) + '</span><span class="pill ' + (c.type === 'evaluation' ? 'info' : '') + '">' + (c.type === 'evaluation' ? '⭐ تقييم' : '↩ رد') + '</span><span class="tm">' + fmtTime(c.createdAt) + (c.editedAt ? ' · معدّل' : '') + '</span></div>' +
      (c.text ? '<p dir="auto">' + richText(c.text) + '</p>' : '') + (c.voice ? '<audio controls preload="none" src="' + esc(c.voice.url) + '"></audio>' : '') +
      ((c.attachments || []).map(a => isImgUrl(a.url) ? '<a href="' + esc(a.url) + '" target="_blank" rel="noopener"><img class="inl" src="' + esc(a.url) + '" alt=""></a>' : '<a class="fchip" href="' + esc(a.url) + '" target="_blank" rel="noopener">📎 ' + esc(a.name) + '</a>').join('')) +
      ((c.author === me || admin) ? '<div class="row" style="gap:6px;margin-top:4px">' + (c.author === me ? '<button class="linkbtn" data-sedit="' + c.id + '">تعديل</button>' : '') + '<button class="linkbtn bad" data-sdel="' + c.id + '">حذف</button></div>' : '') + '</div></div>').join('')
      : '<div class="empty">' + (admin ? 'اكتب أول تقييم للمهمة الفرعية دي' : 'مستني تقييم المدير') + '</div>') +
    (can ? '<div class="muted small" style="margin-top:10px">' + (admin ? '⭐ هتنشر كتقييم' : '↩ هتنشر كرد') + '</div><div class="composer"><button class="btn ghost sm" id="sAtt">📎</button><button class="btn ghost sm" id="sRec">🎙</button><textarea class="inp" id="sText" dir="auto" rows="1" placeholder="' + (admin ? 'اكتب تقييمك…' : 'اكتب ردك…') + '"></textarea><button class="btn pri" id="sSend">إرسال</button></div>' : '<div class="alert warn">👁 للقراءة فقط — المدير والمسؤول بس يقدروا يعلقوا</div>') +
    '</div>', { onClose: () => { S._subOpen = false; openTask(taskId); } });
  $('#back').onclick = () => { S._subOpen = false; openTask(taskId); };
  const save = async comments => {
    const cur = S.tasks.find(x => x.id === taskId);
    await updateTask(taskId, { subtasks: (cur.subtasks || []).map(s => s.id === subId ? { ...s, comments } : s) }, { silent: true });
    openSubThread(taskId, subId);
  };
  const entry = extra => ({ id: uid(), author: me, type: admin ? 'evaluation' : 'reply', text: ($('#sText') ? $('#sText').value.trim() : ''), createdAt: new Date().toISOString(), ...extra });
  const notify = () => push([st.assignedTo, ...assigneesOf(t), ...adminIds()].filter(Boolean), admin ? '⭐ تقييم جديد' : '↩ رد على تقييم', st.title + ' — ' + t.title);
  if (can) {
    $('#sSend').onclick = async () => { if (!$('#sText').value.trim()) return; await save([...cm, entry()]); notify(); };
    $('#sAtt').onclick = async () => {
      const files = await pickFiles('image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt', true); if (!files.length) return;
      toast('جاري الرفع…');
      try { const atts = await Promise.all(files.map(f => uploadFile(f, 'subtask-comments/' + subId))); await save([...cm, entry({ attachments: atts })]); notify(); } catch { toast('فشل الرفع'); }
    };
    const rb = $('#sRec');
    rb.onclick = async () => {
      if (!Rec.mr) { try { await recStart(s => { rb.textContent = '⏹ ' + fmtSec(s); }); } catch { toast('اسمح باستخدام الميكروفون'); } }
      else { rb.disabled = true; try { const f = await recStop('subtask-comments/' + subId); await save([...cm, entry({ voice: { url: f.url, path: f.path, duration: f.duration } })]); notify(); } catch { toast('فشل حفظ الصوت'); } }
    };
  }
  $$('[data-sedit]', root).forEach(b => b.onclick = async () => { const c = cm.find(x => x.id === b.dataset.sedit); const n = prompt('تعديل:', c.text || ''); if (n === null) return; await save(cm.map(x => x.id === c.id ? { ...x, text: n.trim(), editedAt: new Date().toISOString() } : x)); });
  $$('[data-sdel]', root).forEach(b => b.onclick = async () => { if (confirm('حذف التعليق؟')) await save(cm.filter(x => x.id !== b.dataset.sdel)); });
}

/* ───────── BRIEFS ───────── */
function briefFor(b) { return (b.assignees && b.assignees.length) ? b.assignees.map(id => av(id, false, true) + esc(firstName(id))).join(' ') : '👥 للكل'; }
function briefMini(b) {
  return '<a class="card bmini" href="#/briefs/' + b.id + '">' + av(b.created_by) + '<div class="grow"><div class="row"><b>' + esc(firstName(b.created_by)) + '</b><span class="pill ' + URG_CLS[b.urgency] + '">' + (URG_AR[b.urgency] || b.urgency) + '</span><span class="muted small">' + fmtTime(b.created_at) + '</span></div>' +
    '<div class="clamp2" dir="auto">' + (b.text ? esc(b.text) : (b.voice_url ? '🎙 بريف صوتي' : '')) + '</div></div></a>';
}
function viewBriefs(v) {
  const me = S.me.id;
  if (S.routeArg) setTimeout(() => { const el = document.getElementById('brief-' + S.routeArg); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('flash'); } }, 80);
  v.innerHTML = '<h1 class="ptitle">👑 البريفات</h1><div class="muted small" style="margin:-6px 2px 12px">تعليمات صاحبة البراند والإدارة للفريق</div>' +
    (canBrief() ? '<button class="btn pri" id="bNew" style="margin-bottom:12px">+ بريف جديد</button>' : '') +
    (S.briefs.length ? S.briefs.map(b => briefCard(b)).join('') : '<div class="empty">مفيش بريفات لسه</div>');
  const bn = $('#bNew', v); if (bn) bn.onclick = () => newBrief();
  bindBriefs(v);
}
function briefCard(b) {
  const me = S.me.id, own = b.created_by === me || isAdmin();
  const od = b.deadline && dayDiff(b.deadline) < 0;
  const cms = S.briefCmts[b.id];
  const task = b.task_id ? S.tasks.find(t => t.id === b.task_id) : null;
  const content = b.content_id ? S.items.find(i => i.id === b.content_id) : null;
  return '<div class="card pad brief" id="brief-' + b.id + '"><div class="row">' + av(b.created_by, true) + '<div class="grow"><b>' + esc(nameOf(b.created_by)) + '</b><div class="muted small">' + fmtTime(b.created_at) + '</div></div>' +
    '<span class="pill ' + URG_CLS[b.urgency] + '">' + (URG_AR[b.urgency] || b.urgency) + '</span>' + (own ? '<button class="btn ghost sm" data-bedit="' + b.id + '">✎</button><button class="btn ghost sm" data-bdel="' + b.id + '">🗑</button>' : '') + '</div>' +
    '<div class="muted small" style="margin:8px 0">لـ: ' + briefFor(b) + '</div>' +
    (b.text ? '<div class="desc" dir="auto">' + richText(b.text) + '</div>' : '') +
    (b.deadline ? '<div style="margin:6px 0"><span class="pill ' + (od ? 'late' : '') + '">' + (od ? '⚠️ الموعد فات: ' : '📅 الموعد: ') + fmtShort(b.deadline) + '</span></div>' : '') +
    (b.voice_url ? '<audio controls preload="none" src="' + esc(b.voice_url) + '" style="width:100%;margin:6px 0"></audio>' : '') +
    (b.notes ? '<div class="alert" style="background:var(--beige-l)"><b>ملاحظات</b><div dir="auto">' + richText(b.notes) + '</div></div>' : '') +
    ((b.attachments || []).length || own ? '<div class="files" style="margin-top:8px">' + (b.attachments || []).map(a => '<div class="att"><a class="file" href="' + esc(a.url) + '" target="_blank" rel="noopener" style="background-image:url(\'' + esc(a.url) + '\')">' + (own || a.uploadedBy === me ? '<button class="x" data-batdel="' + b.id + '|' + esc(a.id) + '">×</button>' : '') + '</a><div class="note" dir="auto">' + esc(a.note || '') + (own ? ' <button class="linkbtn" data-batnote="' + b.id + '|' + esc(a.id) + '">' + (a.note ? '✎' : '+ ملاحظة') + '</button>' : '') + '</div></div>').join('') + (own ? '<label class="file add" data-badd="' + b.id + '">+</label>' : '') + '</div>' : '') +
    '<div class="row wrap" style="margin-top:10px;gap:6px">' +
    (task ? '<button class="chip-link" data-task="' + task.id + '">☑️ ' + esc(task.title.slice(0, 30)) + '</button>' : (isAdmin() ? '<button class="btn sm" data-b2task="' + b.id + '">➡️ تحويل لمهمة</button>' : '')) +
    (content ? '<button class="chip-link" data-open="' + content.id + '">🎬 ' + esc(content.title.slice(0, 30)) + '</button>' : '<button class="btn sm" data-b2content="' + b.id + '">🎬 تحويل لمحتوى</button>') +
    '<button class="btn sm ghost" data-bcm="' + b.id + '">💬 التعليقات' + (cms ? ' (' + cms.length + ')' : '') + '</button></div>' +
    (S._openBriefCm === b.id ? '<div class="bcm">' + (cms ? (cms.length ? cms.map(c => '<div class="cmt">' + av(c.author) + '<div class="bub"><div class="row"><span class="who">' + esc(firstName(c.author)) + '</span><span class="tm">' + fmtTime(c.created_at) + '</span></div><p dir="auto">' + richText(c.text) + '</p></div></div>').join('') : '<div class="muted small">مفيش تعليقات — كن أول واحد</div>') : '<div class="muted small">…</div>') + composer('bc' + b.id.slice(0, 8), 'اكتب تعليق…') + '</div>' : '') +
    '</div>';
}
function bindBriefs(v) {
  const me = S.me.id;
  $$('[data-bcm]', v).forEach(b => b.onclick = async () => {
    const id = b.dataset.bcm; S._openBriefCm = S._openBriefCm === id ? null : id;
    if (S._openBriefCm && !S.briefCmts[id]) { const { data } = await sb.from('brief_comments').select('*').eq('brief_id', id).order('created_at'); S.briefCmts[id] = data || []; }
    renderAll();
  });
  if (S._openBriefCm) {
    const id = S._openBriefCm, br = S.briefs.find(x => x.id === id);
    if (!S.briefCmts[id]) sb.from('brief_comments').select('*').eq('brief_id', id).order('created_at').then(({ data }) => { S.briefCmts[id] = data || []; renderAll(); });
    bindComposer(v, 'bc' + id.slice(0, 8), async txt => {
      await sb.from('brief_comments').insert({ brief_id: id, author: me, text: txt });
      const { data } = await sb.from('brief_comments').select('*').eq('brief_id', id).order('created_at'); S.briefCmts[id] = data || [];
      push([br && br.created_by, ...mentionsIn(txt)].filter(Boolean), '💬 تعليق على بريف', firstName(me) + ': ' + txt.slice(0, 90));
      renderAll();
    });
  }
  $$('[data-bdel]', v).forEach(b => b.onclick = async () => { if (!confirm('حذف البريف؟')) return; await sb.from('maha_briefs').delete().eq('id', b.dataset.bdel); await loadBriefs(); renderAll(); });
  $$('[data-bedit]', v).forEach(b => b.onclick = () => newBrief(S.briefs.find(x => x.id === b.dataset.bedit)));
  $$('[data-badd]', v).forEach(b => b.onclick = async () => {
    const id = b.dataset.badd, files = (await pickFiles('image/*', true)).filter(f => f.size <= 10 * 1024 * 1024); if (!files.length) return;
    toast('جاري الرفع…'); const add = [];
    for (const f of files) { try { const u = await uploadFile(f, 'briefs'); add.push({ id: uid(), url: u.url, path: u.path, name: f.name, uploadedBy: me, uploadedAt: new Date().toISOString(), note: '' }); } catch {} }
    const br = S.briefs.find(x => x.id === id); await sb.from('maha_briefs').update({ attachments: [...(br.attachments || []), ...add] }).eq('id', id); await loadBriefs(); renderAll();
  });
  $$('[data-batdel]', v).forEach(b => b.onclick = async e => {
    e.preventDefault(); e.stopPropagation(); if (!confirm('حذف الصورة؟')) return;
    const [id, aid] = b.dataset.batdel.split('|'); const br = S.briefs.find(x => x.id === id); const a = (br.attachments || []).find(x => x.id === aid); if (a && a.path) sb.storage.from(BUCKET).remove([a.path]);
    await sb.from('maha_briefs').update({ attachments: (br.attachments || []).filter(x => x.id !== aid) }).eq('id', id); await loadBriefs(); renderAll();
  });
  $$('[data-batnote]', v).forEach(b => b.onclick = async () => {
    const [id, aid] = b.dataset.batnote.split('|'); const br = S.briefs.find(x => x.id === id); const a = (br.attachments || []).find(x => x.id === aid);
    const n = prompt('ملاحظة على الصورة:', (a && a.note) || ''); if (n === null) return;
    await sb.from('maha_briefs').update({ attachments: (br.attachments || []).map(x => x.id === aid ? { ...x, note: n.trim() } : x) }).eq('id', id); await loadBriefs(); renderAll();
  });
  $$('[data-b2task]', v).forEach(b => b.onclick = () => { const br = S.briefs.find(x => x.id === b.dataset.b2task); newTask({ title: (br.text || 'بريف صوتي').split('\n')[0].slice(0, 80), description: (br.text || '') + (br.voice_url ? '\n🎙 ' + br.voice_url : '') + (br.notes ? '\n\n' + br.notes : ''), deadline: br.deadline, priority: br.urgency === 'Urgent' ? 'Urgent' : br.urgency === 'High' ? 'High' : 'Medium', assigned_to: br.assignees || [], brief_id: br.id }); });
  $$('[data-b2content]', v).forEach(b => b.onclick = async () => {
    const br = S.briefs.find(x => x.id === b.dataset.b2content);
    const it = await createItem({ title: (br.text || 'بريف صوتي').split('\n')[0].slice(0, 80), brief: (br.text || '') + (br.notes ? '\n\n' + br.notes : ''), due_date: br.deadline, brief_id: br.id, owner: (br.assignees && br.assignees[0]) || S.me.id, ref_url: br.voice_url || null, ref_source: br.voice_url ? 'بريف صوتي' : null }, { open: false });
    if (it) { await sb.from('maha_briefs').update({ content_id: it.id }).eq('id', br.id); br.content_id = it.id; renderAll(); toast('اتعمل كارت محتوى ✓'); openItem(it.id); }
  });
}
function newBrief(edit) {
  const b = edit || {}, sel = new Set(b.assignees || []);
  let voice = b.voice_url ? { url: b.voice_url, duration: b.voice_duration } : null;
  const root = sheet('<div class="sh"><b class="grow">' + (edit ? 'تعديل البريف' : 'بريف جديد') + '</b><button class="btn ghost sm" id="x">✕</button></div><div class="sb">' +
    '<label class="lb">التعليمات</label><textarea class="inp" id="bT" dir="auto" rows="4" placeholder="اكتب تعليمات النهارده…">' + esc(b.text || '') + '</textarea>' +
    '<div class="g2"><div><label class="lb">الأهمية</label><select class="inp" id="bU">' + URG.map(u => '<option value="' + u + '"' + (u === (b.urgency || 'Normal') ? ' selected' : '') + '>' + URG_AR[u] + '</option>').join('') + '</select></div>' +
    '<div><label class="lb">الموعد</label><input type="date" class="inp" id="bD" value="' + esc(b.deadline || '') + '"></div></div>' +
    '<label class="lb">لمين؟ (فاضي = للكل)</label><div class="toggles" id="bA">' + S.team.map(m => '<button class="tg' + (sel.has(m.id) ? ' on' : '') + '" data-a="' + esc(m.id) + '">' + av(m.id, false, true) + esc(firstName(m.id)) + '</button>').join('') + '</div>' +
    '<label class="lb">ملاحظة صوتية</label><div id="bV"></div>' +
    '<label class="lb">ملاحظات إضافية</label><textarea class="inp" id="bN" dir="auto" placeholder="أي تفاصيل إضافية للفريق…">' + esc(b.notes || '') + '</textarea>' +
    '</div><div class="sf"><button class="btn pri" id="bSave">' + (edit ? 'حفظ' : 'نشر البريف') + '</button></div>');
  $('#x').onclick = closeSheet;
  $$('[data-a]', root).forEach(x => x.onclick = () => { x.classList.toggle('on'); sel.has(x.dataset.a) ? sel.delete(x.dataset.a) : sel.add(x.dataset.a); });
  const drawVoice = () => {
    $('#bV').innerHTML = voice ? '<div class="voice">🎙 ' + (voice.duration ? fmtSec(voice.duration) : '') + ' <button class="xbtn" id="bVx">✕</button><audio controls src="' + esc(voice.url) + '"></audio></div>' : '<button class="btn sm" id="bRec">🎙 تسجيل</button>';
    if (voice) $('#bVx').onclick = () => { voice = null; drawVoice(); };
    else $('#bRec').onclick = async () => {
      const rb = $('#bRec');
      if (!Rec.mr) { try { await recStart(s => { rb.textContent = '⏹ إيقاف · ' + fmtSec(s); }); } catch { toast('اسمح باستخدام الميكروفون'); } }
      else { rb.disabled = true; rb.textContent = 'جاري الحفظ…'; try { const f = await recStop('briefs'); voice = { url: f.url, duration: f.duration }; } catch { toast('فشل حفظ الصوت'); } drawVoice(); }
    };
  };
  drawVoice();
  $('#bSave').onclick = async () => {
    const text = $('#bT').value.trim();
    if (!text && !voice) return toast('اكتب تعليمات أو سجل صوت');
    $('#bSave').disabled = true;
    const row = { text, urgency: $('#bU').value, deadline: $('#bD').value || null, assignees: sel.size ? [...sel] : null, notes: $('#bN').value.trim() || null, voice_url: voice ? voice.url : null, voice_duration: voice ? voice.duration : null };
    const { error } = edit ? await sb.from('maha_briefs').update(row).eq('id', edit.id) : await sb.from('maha_briefs').insert({ ...row, created_by: S.me.id, attachments: [] });
    if (error) { $('#bSave').disabled = false; console.error(error); return toast('تعذر الحفظ'); }
    if (!edit) push(sel.size ? [...sel] : others(), '👑 بريف جديد من ' + firstName(S.me.id), (text || 'ملاحظة صوتية').slice(0, 120));
    closeSheet(); await loadBriefs(); if (S.route !== 'briefs') go('briefs'); else renderAll(); toast('تم ✓');
  };
}

/* ───────── CHAT ───────── */
function viewChat(v) {
  markChatSeen();
  const me = S.me.id;
  let last = null, lastDay = null;
  const rows = S.chat.map(m => {
    const day = String(m.created_at).slice(0, 10), mine = m.author === me, cont = last === m.author && lastDay === day;
    const sep = day !== lastDay ? '<div class="daysep">' + fmtDay(day) + '</div>' : '';
    last = m.author; lastDay = day;
    return sep + '<div class="msg' + (mine ? ' mine' : '') + (cont ? ' cont' : '') + '">' + (mine || cont ? '<span class="avsp"></span>' : av(m.author)) +
      '<div class="mb">' + (!mine && !cont ? '<div class="who">' + esc(firstName(m.author)) + '</div>' : '') + '<div dir="auto">' + richText(m.text) + '</div><div class="tm">' + fmtClock(m.created_at) + '</div></div></div>';
  }).join('');
  v.innerHTML = '<div class="chat"><div class="chat-h"><b>💬 شات الفريق</b><span class="muted small">' + S.team.length + ' أعضاء · مباشر</span></div><div class="chat-body" id="chatBody">' + (rows || '<div class="empty">مفيش رسائل لسه</div>') + '</div>' +
    '<div class="chat-in"><button class="btn ghost" id="chAtt">📎</button><textarea class="inp" id="chText" dir="auto" rows="1" placeholder="اكتب رسالة…"></textarea><button class="btn pri" id="chSend">إرسال</button></div></div>';
  const body = $('#chatBody'); body.scrollTop = body.scrollHeight;
  const ta = $('#chText');
  if (S._chatDraft) { ta.value = S._chatDraft; }
  ta.oninput = () => { S._chatDraft = ta.value; };
  const send = async () => {
    const t = ta.value.trim(); if (!t) return;
    ta.value = ''; S._chatDraft = '';
    const { data, error } = await sb.from('chat').insert({ author: me, text: t }).select().single();
    if (error) { ta.value = t; return toast('لم يتم الإرسال'); }
    if (!S.chat.find(x => x.id === data.id)) S.chat.push(data);
    const ment = mentionsIn(t).filter(id => id !== me);
    if (ment.length) push(ment, '💬 ' + firstName(me) + ' ذكرك في الشات', t.slice(0, 100));
    renderAll(); setTimeout(() => $('#chText') && $('#chText').focus(), 30);
  };
  $('#chSend').onclick = send;
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 700) { e.preventDefault(); send(); } });
  $('#chAtt').onclick = async () => {
    const files = await pickFiles('*/*', false); if (!files.length) return; toast('جاري الرفع…');
    try { const f = await uploadFile(files[0], 'chat'); ta.value = (ta.value ? ta.value + '\n' : '') + f.url + ' '; S._chatDraft = ta.value; ta.focus(); } catch { toast('فشل الرفع'); }
  };
}

VIEWS.tasks = viewTasks; VIEWS.briefs = viewBriefs; VIEWS.chat = viewChat;
