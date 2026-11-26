'use strict';
/* Team & account: members, roles, approvers, passwords, photos, announcements. */
/* ───────── TEAM & ACCOUNT ───────── */
const TEAM_ERRORS = {
  bad_username: 'اسم المستخدم: حروف إنجليزي صغيرة وأرقام فقط (3–20)، ويبدأ بحرف',
  name_required: 'اكتب الاسم', weak_password: 'كلمة المرور 8 حروف على الأقل', username_taken: 'اسم المستخدم مستخدم قبل كده',
  last_admin: 'لازم يفضل مدير واحد على الأقل', last_approver: 'لازم يفضل شخص واحد على الأقل يقدر يوافق',
  cannot_delete_self: 'مينفعش تحذف حسابك', admins_only: 'الصلاحية دي للمديرين فقط', not_signed_in: 'انتهت الجلسة، سجل الدخول تاني'
};
async function teamAdmin(body) {
  const { data, error } = await sb.functions.invoke('team-admin', { body });
  if (error) { let code = 'server_error'; try { code = (await error.context.json()).error || code; } catch {} throw new Error(TEAM_ERRORS[code] || 'حصل خطأ، حاول تاني'); }
  return data;
}
function genPassword() {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789', r = crypto.getRandomValues(new Uint32Array(10));
  const pick = (from, n) => Array.from(r.slice(from, from + n)).map(x => a[x % a.length]).join('');
  return 'Muhra-' + pick(0, 6) + '-' + pick(6, 4);
}
function credCard(username, password) {
  const txt = 'Muhra HQ\n' + location.origin + location.pathname + '\nاسم المستخدم: ' + username + '\nكلمة المرور المؤقتة: ' + password;
  return '<div class="alert ok" style="text-align:right"><b>ابعت البيانات دي للعضو:</b><div class="lat" dir="ltr" style="text-align:left;margin:8px 0;background:#fff;border-radius:8px;padding:8px;font-weight:600">' + esc(username) + '<br>' + esc(password) + '</div>' +
    '<button class="btn sm" data-copy="' + esc(txt) + '">نسخ الرسالة</button> <span class="small">هيُطلب منه تغييرها أول ما يدخل.</span></div>';
}
function bindCopy(root) { root.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { const t = b.dataset.copy; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('تم النسخ'), () => prompt('انسخ:', t)); }); }

/* The Team page is a normal hub screen (#/team). Editing a member opens a sheet over it. */
function openTeam(note) { S._teamNote = note || ''; closeSheet(); if (S.route !== 'team') go('team'); else renderAll(); }
function viewTeam(v) {
  const note = S._teamNote || ''; S._teamNote = '';
  const admin = isAdmin();
  const row = m => '<div class="row" style="padding:10px 12px;border-bottom:1px solid var(--line)">' + av(m.id, true) +
    '<div class="grow"><div style="font-weight:700">' + esc(m.name) + (m.id === S.me.id ? ' <span class="muted small">(أنت)</span>' : '') + '</div>' +
    '<div class="muted small"><span dir="ltr">' + esc(m.id) + '</span>' + (m.title ? ' · ' + esc(m.title) : '') + '</div>' +
    '<div class="row wrap" style="gap:4px;margin-top:3px">' + (m.role === 'admin' ? '<span class="pill">مدير</span>' : '<span class="pill" style="opacity:.7">عضو</span>') + (m.can_approve ? '<span class="pill okp">يوافق على المحتوى</span>' : '') + pushPill(m.id) + '</div></div>' +
    (admin ? '<button class="btn sm" data-edit="' + esc(m.id) + '">تعديل</button>' : '') + '</div>';
  v.innerHTML = '<h1 class="ptitle">الفريق والحساب</h1>' + note +
    '<div class="sectitle">حسابي</div><div class="card pad"><div class="row">' + av(S.me.id, true) + '<div class="grow"><b>' + esc(S.me.name) + '</b><div class="muted small" dir="ltr" style="text-align:right">' + esc(S.me.id) + '</div></div></div>' +
    '<div class="row wrap" style="margin-top:12px"><button class="btn sm" id="myPhoto">تغيير الصورة</button><button class="btn sm" id="myPw">تغيير كلمة المرور</button><button class="btn sm bad" id="myOut">خروج</button></div></div>' +
    '<div class="sectitle">الإشعارات</div>' + pushBanner(true) +
    '<details class="muted small" style="margin:6px 2px 0"><summary>إشعارات المتصفح (اختياري)</summary><div style="margin-top:8px">' + webPushBanner(true) + '</div></details>' +
    '<div class="sectitle">الأعضاء <span class="muted small">(' + S.team.length + ')</span></div><div class="card">' + S.team.map(row).join('') + '</div>' +
    (admin ? '<button class="btn pri" id="addM" style="width:100%;margin-top:14px">+ إضافة عضو جديد</button>' + announceBlock() : '<div class="muted small" style="margin-top:10px">إضافة وحذف الأعضاء للمديرين فقط.</div>');
  bindCopy(v);
  $('#myPw').onclick = () => renderChangePassword(false);
  $('#myOut').onclick = () => { if (confirm('تسجيل الخروج؟')) signOut(); };
  $('#myPhoto').onclick = () => pickPhoto(S.me.id);
  bindPushBanner(v);
  if (!S._pushLoaded) { S._pushLoaded = true; loadTgStatus(); }
  v.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editMember(b.dataset.edit));
  const add = $('#addM'); if (add) add.onclick = () => editMember(null);
  bindAnnounce(v);
}
/* Admin announcement: push to everyone or chosen people (was in the Tasks app) */
function announceBlock() {
  return '<div class="sectitle">إعلان للفريق</div><div class="card pad"><textarea class="inp" id="annText" dir="auto" placeholder="اكتب الإعلان… يوصل إشعار على موبايل كل شخص"></textarea>' +
    '<div class="toggles" id="annTo" style="margin-top:8px"><button class="tg on" data-ann="all">الكل</button>' + S.team.filter(m => m.id !== S.me.id).map(m => '<button class="tg" data-ann="' + esc(m.id) + '">' + av(m.id, false, true) + esc(firstName(m.id)) + '</button>').join('') + '</div>' +
    '<button class="btn pri" id="annSend" style="margin-top:10px">إرسال الإعلان</button></div>';
}
function bindAnnounce(v) {
  const box = $('#annTo', v); if (!box) return;
  box.querySelectorAll('[data-ann]').forEach(b => b.onclick = () => {
    if (b.dataset.ann === 'all') { box.querySelectorAll('[data-ann]').forEach(x => x.classList.toggle('on', x === b)); return; }
    box.querySelector('[data-ann=all]').classList.remove('on'); b.classList.toggle('on');
    if (!box.querySelector('.tg.on')) box.querySelector('[data-ann=all]').classList.add('on');
  });
  $('#annSend', v).onclick = async () => {
    const t = $('#annText', v).value.trim(); if (!t) return toast('اكتب الإعلان');
    const all = box.querySelector('[data-ann=all]').classList.contains('on');
    const ids = all ? S.team.map(m => m.id) : [...box.querySelectorAll('.tg.on')].map(b => b.dataset.ann);
    await push(ids, '📢 إعلان من ' + firstName(S.me.id), t);
    await sb.from('chat').insert({ author: S.me.id, text: '' + t });
    $('#annText', v).value = ''; toast('تم إرسال الإعلان');
  };
}
function pickPhoto(memberId) {
  const fp = $('#filePick'); fp.value = ''; fp.accept = 'image/*';
  fp.onchange = async () => {
    const f = fp.files[0]; fp.accept = 'image/*,video/*,application/pdf'; if (!f) return;
    if (f.size > 5 * 1024 * 1024) return toast('الصورة أكبر من 5MB');
    const path = 'profiles/' + memberId + '/' + Date.now() + '.' + ((f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg');
    const { error } = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type || 'image/jpeg' });
    if (error) return toast('فشل رفع الصورة');
    const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const { error: e2 } = await sb.from('profiles').upsert({ user_id: memberId, photo_url: url, updated_at: new Date().toISOString() });
    if (e2) return toast('تعذر حفظ الصورة');
    S.photos[memberId] = url; toast('تم تحديث الصورة'); renderShell(); openTeam();
  };
  fp.click();
}
function editMember(id) {
  const m = id ? S.teamMap[id] : null, root = $('#sheetRoot');
  const others = S.team.filter(x => x.id !== id);
  const pw = genPassword();
  root.innerHTML = '<div class="overlay" id="ov"><div class="sheet"><div class="sh"><button class="btn ghost sm" id="back">→ رجوع</button><b class="grow">' + (m ? 'تعديل ' + esc(m.name) : 'عضو جديد') + '</b></div><div class="sb">' +
    '<label class="lb">الاسم</label><input class="inp" id="mName" value="' + esc(m ? m.name : '') + '" placeholder="مثال: Sara Ali">' +
    (m ? '' : '<label class="lb">اسم المستخدم (للدخول)</label><input class="inp lat" id="mUser" dir="ltr" autocapitalize="none" spellcheck="false" placeholder="sara">' +
      '<div class="muted small" style="margin-top:4px">حروف إنجليزي صغيرة وأرقام. مينفعش يتغير بعدين.</div>') +
    '<label class="lb">المسمى الوظيفي</label><input class="inp" id="mTitle" value="' + esc(m ? (m.title || '') : '') + '" placeholder="Content Creator">' +
    '<div class="g2"><div><label class="lb">الصلاحية</label><select class="inp" id="mRole"><option value="member">عضو</option><option value="admin"' + (m && m.role === 'admin' ? ' selected' : '') + '>مدير (يدير الفريق)</option></select></div>' +
    '<div><label class="lb">اللون</label><input type="color" class="inp" id="mColor" value="' + esc(m && /^#[0-9a-f]{6}$/i.test(m.color || '') ? m.color : '#5c3d2e') + '" style="height:44px;padding:4px"></div></div>' +
    '<label class="lb">الموافقة على المحتوى</label><div class="toggles"><button class="tg' + (m && m.can_approve ? ' on' : '') + '" id="mAppr">يقدر يوافق أو يطلب تعديل</button></div>' +
    (m ? '' : '<label class="lb">كلمة مرور مؤقتة</label><div class="linkrow"><input class="inp lat" id="mPw" dir="ltr" value="' + pw + '"><button class="btn" id="regen">↻</button></div>') +
    '<div id="mMsg"></div>' +
    (m ? '<div class="sectitle">كلمة المرور</div><div class="card pad"><div class="muted small">ينشئ كلمة مرور مؤقتة جديدة، والعضو يغيرها أول ما يدخل.</div><button class="btn sm" id="mReset" style="margin-top:8px">إعادة تعيين كلمة المرور</button><div id="resetOut"></div></div>' +
      '<div class="sectitle">الصورة</div><button class="btn sm" id="mPhoto">تغيير صورة ' + esc(firstName(m.id)) + '</button>' +
      (m.id !== S.me.id ? '<div class="sectitle" style="color:var(--bad)">حذف نهائي</div><div class="card pad" style="border-color:#EFC7C1">' +
        '<div class="small">يحذف الحساب نهائيًا ويمنع الدخول فورًا. المحتوى المنشور والتعليقات القديمة تفضل في السجل.</div>' +
        '<label class="lb">نقل شغله المفتوح (المحتوى والمهام) إلى</label><select class="inp" id="mTo"><option value="">— بدون نقل —</option>' + others.map(o => '<option value="' + esc(o.id) + '"' + (o.id === S.me.id ? ' selected' : '') + '>' + esc(o.name) + '</option>').join('') + '</select>' +
        '<label class="lb">للتأكيد اكتب اسم المستخدم: <span class="lat" dir="ltr">' + esc(m.id) + '</span></label><input class="inp lat" id="mConfirm" dir="ltr" autocapitalize="none">' +
        '<button class="btn bad" id="mDel" style="width:100%;margin-top:10px" disabled>حذف نهائي</button></div>' : '') : '') +
    '</div><div class="sf"><button class="btn pri" id="mSave">' + (m ? 'حفظ التعديلات' : 'إنشاء الحساب') + '</button></div></div></div>';
  const msg = (t, cls) => { $('#mMsg').innerHTML = '<div class="alert ' + (cls || 'bad') + '">' + t + '</div>'; };
  $('#back').onclick = () => closeSheet();
  $('#ov').onclick = e => { if (e.target.id === 'ov') closeSheet(); };
  $('#mAppr').onclick = () => $('#mAppr').classList.toggle('on');
  const rg = $('#regen'); if (rg) rg.onclick = () => { $('#mPw').value = genPassword(); };
  $('#mSave').onclick = async () => {
    const b = $('#mSave'); b.disabled = true;
    const payload = { name: $('#mName').value.trim(), title: $('#mTitle').value.trim(), role: $('#mRole').value, color: $('#mColor').value, can_approve: $('#mAppr').classList.contains('on') };
    try {
      if (m) { await teamAdmin({ action: 'update', id: m.id, ...payload }); await loadTeam(); if (m.id === S.me.id) S.me = S.teamMap[m.id] || S.me; renderShell(); openTeam('<div class="alert ok">تم حفظ بيانات ' + esc(payload.name) + ' ' + ic('check') + '</div>'); }
      else {
        const username = $('#mUser').value.trim().toLowerCase(), password = $('#mPw').value.trim();
        await teamAdmin({ action: 'create', username, password, ...payload });
        await loadTeam(); renderAll();
        openTeam('<div class="alert ok" style="margin-top:12px">تم إنشاء حساب ' + esc(payload.name) + ' ' + ic('check') + '</div>' + credCard(username, password));
      }
    } catch (e) { b.disabled = false; msg(esc(e.message)); }
  };
  if (m) {
    $('#mPhoto').onclick = () => pickPhoto(m.id);
    $('#mReset').onclick = async () => {
      if (!confirm('إعادة تعيين كلمة مرور ' + m.name + '؟ القديمة هتتوقف.')) return;
      const np = genPassword(); $('#mReset').disabled = true;
      try { await teamAdmin({ action: 'reset_password', id: m.id, password: np }); $('#resetOut').innerHTML = credCard(m.id, np); bindCopy($('#resetOut')); }
      catch (e) { $('#resetOut').innerHTML = '<div class="alert bad">' + esc(e.message) + '</div>'; }
      $('#mReset').disabled = false;
    };
    const del = $('#mDel');
    if (del) {
      $('#mConfirm').oninput = () => { del.disabled = $('#mConfirm').value.trim().toLowerCase() !== m.id; };
      del.onclick = async () => {
        del.disabled = true; del.textContent = '...';
        try {
          const r = await teamAdmin({ action: 'delete', id: m.id, transfer_to: $('#mTo').value || null });
          await Promise.all([loadTeam(), loadItems()]); renderAll();
          const mv = r && r.moved ? ' — اتنقل ' + (r.moved.content || 0) + ' محتوى و' + (r.moved.tasks || 0) + ' مهمة' : '';
          openTeam('<div class="alert ok" style="margin-top:12px">تم حذف ' + esc(m.name) + ' نهائيًا' + mv + '</div>');
        } catch (e) { del.disabled = false; del.textContent = 'حذف نهائي'; msg(esc(e.message)); }
      };
    }
  }
}


VIEWS.team = viewTeam;
