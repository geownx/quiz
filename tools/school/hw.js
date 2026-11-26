/* 학교생활 · 과제 — 수행평가 · 보고서 · 숙제를 달력에 따로 모아요 (체크리스트와 별개)
   안내문 · 자료 사진은 내 전용 사진함(Supabase Storage 'tools-files')에 보관하고,
   나중에 그 사진으로 바로 문제지를 만들 수 있어요. */
'use strict';
(function () {
  const { $, $$, esc, toast, modal, sb, todayKey, parseKey, shiftKey } = QT;
  const BUCKET = 'tools-files';
  const KINDS = ['수행평가', '보고서', '숙제', '발표', '실험', '기타'];
  const must = ({ data, error }) => { if (error) throw new Error(QT.dbErr(error, '과제')); return data; };
  let UID = null, SUBS = [];
  const S = { list: null, month: todayKey().slice(0, 7), sel: null, showDone: false, box: null };

  /* ---------- 데이터 ---------- */
  const D = {
    async list() { return must(await sb().from('tools_assignments').select('*').order('due', { ascending: true, nullsFirst: false }).order('created_at')); },
    async add(row) { return must(await sb().from('tools_assignments').insert(row).select().single()); },
    async update(id, patch) { return must(await sb().from('tools_assignments').update(Object.assign({ updated_at: new Date().toISOString() }, patch)).eq('id', id).select().single()); },
    async remove(a) {
      const paths = (a.files || []).map(f => f.path).filter(Boolean);
      if (paths.length) { try { await sb().storage.from(BUCKET).remove(paths); } catch (e) {} }
      must(await sb().from('tools_assignments').delete().eq('id', a.id));
    },
    /* 사진 줄여서 올리기: 긴 변 2000px · JPEG (PDF · HEIC은 그대로) */
    async shrink(file) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.2e6) return file;
      try {
        const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(file); });
        const k = Math.min(1, 2000 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const b = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.85)); URL.revokeObjectURL(img.src);
        return b && b.size < file.size ? new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
      } catch (e) { return file; }
    },
    async upload(aid, file, tag) {
      const f = await D.shrink(file);
      if (f.size > 15 * 1048576) throw new Error(`"${file.name}"가 너무 커요. 15MB까지 올릴 수 있어요.`);
      const safe = f.name.replace(/[^\w.\-가-힣]/g, '_').slice(-60);
      const path = `${UID}/${aid}/${Date.now()}-${safe}`;
      const { error } = await sb().storage.from(BUCKET).upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false });
      if (error) throw new Error(/bucket|not found/i.test(error.message || '') ? '사진함이 아직 없어요. supabase_stage3.sql을 실행해 주세요.' : '사진을 올리지 못했어요: ' + error.message);
      return { path, name: file.name, type: f.type, size: f.size, tag };
    },
    async urls(files) {
      const paths = (files || []).map(f => f.path); if (!paths.length) return {};
      const { data } = await sb().storage.from(BUCKET).createSignedUrls(paths, 3600);
      const m = {}; (data || []).forEach(x => { if (x.signedUrl) m[x.path] = x.signedUrl; }); return m;
    },
    async removeFile(path) { try { await sb().storage.from(BUCKET).remove([path]); } catch (e) {} },
  };

  /* ---------- 도우미 ---------- */
  const sub = a => SUBS.find(s => s.id === a.subject_id) || (a.subject ? { name: a.subject, color: '#8a8fa3' } : null);
  const dleft = a => a.due ? Math.round((parseKey(a.due) - parseKey(todayKey())) / 864e5) : null;
  const dTxt = a => { const n = dleft(a); return n == null ? '마감일 없음' : n === 0 ? 'D-DAY' : n > 0 ? `D-${n}` : `${-n}일 지남`; };
  const chip = a => { const s = sub(a); return s ? `<span class="hs" style="--c:${esc(s.color)}">${esc(s.name)}</span>` : ''; };
  const md = k => { const d = parseKey(k); return `${d.getMonth() + 1}/${d.getDate()}(${'일월화수목금토'[d.getDay()]})`; };

  /* ---------- 화면 ---------- */
  async function render(box, ctx) {
    S.box = box; UID = ctx.user.id;
    SUBS = (QT.CL && QT.CL.cache.get('subjects', [])) || [];
    box.innerHTML = '<div class="loadingdot"><div class="spin"></div>불러오는 중…</div>';
    try {
      const [list, subs] = await Promise.all([D.list(), QT.CL ? QT.CL.subjects().catch(() => SUBS) : SUBS]);
      S.list = list; SUBS = subs || SUBS;
    } catch (e) {
      box.innerHTML = `<div class="card"><b class="err">과제를 불러오지 못했어요</b><p class="sub" style="margin:6px 0 0">${esc(e.message)}</p>${/relation|schema cache|PGRST205|tools_assignments/.test(e.message) ? '<p class="sub">Supabase에서 <b>supabase_stage3.sql</b>을 실행하면 생겨요.</p>' : ''}</div>`;
      return;
    }
    draw();
    const open = new URLSearchParams(location.search).get('hw'); if (open) { const a = S.list.find(x => x.id === open); if (a) detail(a); }
  }
  function draw() {
    const box = S.box; if (!box) return;
    const up = S.list.filter(a => !a.done).sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : 1);
    const done = S.list.filter(a => a.done);
    box.innerHTML = `
      <div class="hwtop"><button class="btn acc" id="hwAdd">＋ 과제 추가</button><span class="sub">수행평가 · 보고서 · 숙제를 체크리스트와 따로 모아요</span></div>
      <div class="hwg">
        <div class="card hcal"><div class="ch"><div class="mnav"><button id="hmP" aria-label="이전 달">‹</button><b id="hmL"></b><button id="hmN" aria-label="다음 달">›</button></div><button class="link" id="hmT">이번 달</button></div><div id="hcal"></div></div>
        <div class="hwl">
          <div class="card"><div class="ch"><b>📌 해야 할 과제 <small>${up.length}</small></b></div><div id="hUp">${up.length ? up.map(row).join('') : '<p class="empty2">해야 할 과제가 없어요. 오늘은 홀가분 🎈</p>'}</div></div>
          ${done.length ? `<div class="card"><button class="hdone-t" id="hDoneT">✅ 제출한 과제 ${done.length}개 ${S.showDone ? '접기' : '보기'}</button>${S.showDone ? `<div>${done.sort((a, b) => (b.due || '') < (a.due || '') ? -1 : 1).map(row).join('')}</div>` : ''}</div>` : ''}
        </div>
      </div>`;
    drawCal();
    $('#hwAdd').onclick = () => form(null, S.sel);
    $('#hmP').onclick = () => { shiftMonth(-1); }; $('#hmN').onclick = () => { shiftMonth(1); };
    $('#hmT').onclick = () => { S.month = todayKey().slice(0, 7); drawCal(); };
    const dt = $('#hDoneT'); if (dt) dt.onclick = () => { S.showDone = !S.showDone; draw(); };
    bindRows(box);
  }
  function row(a) {
    const n = dleft(a), hot = !a.done && n != null && n <= 3;
    return `<div class="hrow ${a.done ? 'done' : ''}" data-id="${a.id}">
      <button class="hck" data-ck aria-label="제출 체크">${a.done ? '✓' : ''}</button>
      <div class="hm"><div class="ht">${chip(a)}<span class="hk">${esc(a.kind)}</span>${(a.files || []).length ? `<span class="hf">📎${a.files.length}</span>` : ''}</div>
        <b>${esc(a.title)}</b><small>${a.due ? md(a.due) : ''}${a.weight ? ` · 반영 ${+a.weight}%` : ''}${a.score != null ? ` · ${+a.score}${a.points ? '/' + +a.points : ''}점` : ''}${a.prep ? ' · 준비물 있음' : ''}</small></div>
      <span class="hd ${hot ? 'hot' : ''} ${a.done ? 'ok' : ''}">${a.done ? '제출' : dTxt(a)}</span></div>`;
  }
  function bindRows(root) {
    $$('.hrow', root).forEach(el => {
      const a = S.list.find(x => x.id === el.dataset.id);
      el.onclick = e => { if (e.target.closest('[data-ck]')) return; detail(a); };
      $('[data-ck]', el).onclick = async () => { try { Object.assign(a, await D.update(a.id, { done: !a.done, done_at: !a.done ? new Date().toISOString() : null })); toast(a.done ? '제출 완료! 👏' : '제출 취소했어요'); draw(); } catch (e) { toast(e.message); } };
    });
  }
  function shiftMonth(n) { const [y, m] = S.month.split('-').map(Number), d = new Date(y, m - 1 + n, 1); S.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; drawCal(); }
  function drawCal() {
    const box = $('#hcal'); if (!box) return;
    const [y, m] = S.month.split('-').map(Number), first = new Date(y, m - 1, 1), start = shiftKey(`${y}-${String(m).padStart(2, '0')}-01`, -first.getDay());
    $('#hmL').textContent = `${y}년 ${m}월`;
    const byDay = {}; S.list.forEach(a => { if (a.due) (byDay[a.due] = byDay[a.due] || []).push(a); });
    let html = '<div class="cw">' + '일월화수목금토'.split('').map((d, i) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${d}</span>`).join('') + '</div><div class="cg">';
    for (let i = 0; i < 42; i++) {
      const k = shiftKey(start, i), d = parseKey(k), inM = d.getMonth() === m - 1, its = byDay[k] || [];
      if (i === 35 && !inM) break;
      html += `<button class="cd ${inM ? '' : 'out'} ${k === todayKey() ? 'td' : ''} ${k === S.sel ? 'sel' : ''} ${d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''}" data-k="${k}">
        <i>${d.getDate()}</i>${its.slice(0, 3).map(a => { const s = sub(a); return `<em class="${a.done ? 'dn' : ''}" style="--c:${esc(s ? s.color : '#8a8fa3')}"><span>${esc(a.title)}</span></em>`; }).join('')}${its.length > 3 ? `<small>+${its.length - 3}</small>` : ''}</button>`;
    }
    box.innerHTML = html + '</div><div id="hSel"></div>';
    $$('.cd', box).forEach(b => b.onclick = () => { S.sel = S.sel === b.dataset.k ? null : b.dataset.k; drawCal(); });
    if (S.sel) {
      const its = byDay[S.sel] || [], el = $('#hSel');
      el.innerHTML = `<div class="hsel"><b>${QT.prettyDate(S.sel).main}</b><button class="btn sm" id="hSelAdd">＋ 이 날 과제 추가</button></div>${its.map(row).join('') || '<p class="empty2">이 날 마감인 과제가 없어요</p>'}`;
      $('#hSelAdd').onclick = () => form(null, S.sel); bindRows(el);
    }
  }

  /* ---------- 추가 · 수정 ---------- */
  function form(a, day) {
    const v = a ? { ...a } : { kind: '수행평가', due: day || '', subject_id: null, subject: '', files: [] };
    const pending = []; // 새로 고른 사진 {file, tag}
    const m = modal(`<div class="hwf"><h3>${a ? '과제 수정' : '과제 추가'}</h3>
      <label class="lb">종류</label><div class="pick" id="fK">${KINDS.map(k => `<button type="button" data-k="${k}" class="${v.kind === k ? 'on' : ''}">${k}</button>`).join('')}</div>
      <label class="lb">과목</label><div class="pick" id="fS">${SUBS.map(s => `<button type="button" data-s="${s.id}" class="${v.subject_id === s.id ? 'on' : ''}" style="--c:${esc(s.color)}"><i style="background:${esc(s.color)}"></i>${esc(s.name)}</button>`).join('')}<input type="text" id="fSx" placeholder="직접 입력" value="${esc(v.subject_id ? '' : v.subject || '')}" maxlength="20"></div>
      <label class="lb">제목</label><input type="text" id="fT" maxlength="80" placeholder="예: 시 낭송 발표, 탐구 보고서" value="${esc(v.title || '')}">
      <div class="f2"><div><label class="lb">마감일</label><input type="date" id="fD" value="${esc(v.due || '')}"></div>
        <div><label class="lb">배점</label><input type="number" id="fP" inputmode="decimal" placeholder="예: 20" value="${v.points ?? ''}"></div>
        <div><label class="lb">반영 비율 %</label><input type="number" id="fW" inputmode="decimal" placeholder="예: 10" value="${v.weight ?? ''}"></div></div>
      <label class="lb">준비물</label><input type="text" id="fR" maxlength="300" placeholder="예: 발표 자료 USB, 색연필" value="${esc(v.prep || '')}">
      <label class="lb">메모</label><textarea id="fM" rows="3" maxlength="2000" placeholder="평가 기준, 조원, 선생님 말씀 등">${esc(v.memo || '')}</textarea>
      <label class="lb">안내문 · 자료 사진</label>
      <div class="fup"><label class="btn"><input type="file" accept="image/*" capture="environment" hidden data-tag="안내문">📷 안내문 찍기</label>
        <label class="btn"><input type="file" accept="image/*,application/pdf" multiple hidden data-tag="자료">📎 자료 올리기</label></div>
      <div class="fth" id="fTh"></div>
      ${a ? `<div class="f2"><div><label class="lb">받은 점수</label><input type="number" id="fSc" inputmode="decimal" value="${v.score ?? ''}"></div><div><label class="lb">제출</label><label class="fck"><input type="checkbox" id="fDone" ${v.done ? 'checked' : ''}> 제출했어요</label></div></div>` : ''}
      <div class="mbtns"><button class="btn" data-close>취소</button><button class="btn acc" id="fGo">${a ? '저장' : '추가'}</button></div></div>`);
    m.classList.add('hwm');
    const thumbs = () => { $('#fTh', m).innerHTML = (v.files || []).map((f, i) => `<span class="ft"><b>${esc(f.tag || '자료')}</b>${esc(f.name)}<button type="button" data-rm="${i}">✕</button></span>`).join('') + pending.map((p, i) => `<span class="ft new"><b>${p.tag}</b>${esc(p.file.name)}<button type="button" data-rp="${i}">✕</button></span>`).join('');
      $$('[data-rm]', m).forEach(b => b.onclick = () => { const f = v.files.splice(+b.dataset.rm, 1)[0]; (v.drop = v.drop || []).push(f.path); thumbs(); });
      $$('[data-rp]', m).forEach(b => b.onclick = () => { pending.splice(+b.dataset.rp, 1); thumbs(); }); };
    thumbs();
    $$('#fK button', m).forEach(b => b.onclick = () => { v.kind = b.dataset.k; $$('#fK button', m).forEach(x => x.classList.toggle('on', x === b)); });
    $$('#fS button', m).forEach(b => b.onclick = () => { const on = v.subject_id !== b.dataset.s; v.subject_id = on ? b.dataset.s : null; $$('#fS button', m).forEach(x => x.classList.toggle('on', on && x === b)); if (on) $('#fSx', m).value = ''; });
    $('#fSx', m).oninput = e => { if (e.target.value) { v.subject_id = null; $$('#fS button', m).forEach(x => x.classList.remove('on')); } };
    $$('input[type=file]', m).forEach(inp => inp.onchange = () => { [...inp.files].forEach(f => pending.push({ file: f, tag: inp.dataset.tag })); inp.value = ''; thumbs(); });
    $('#fGo', m).onclick = async () => {
      const title = $('#fT', m).value.trim(); if (!title) return toast('제목을 적어 주세요');
      const num = id => { const x = $(id, m); return x && x.value !== '' ? +x.value : null; };
      const sx = $('#fSx', m).value.trim(), s = SUBS.find(z => z.id === v.subject_id);
      const row = { kind: v.kind, subject_id: v.subject_id || null, subject: s ? s.name : sx || null, title, due: $('#fD', m).value || null, points: num('#fP'), weight: num('#fW'), prep: $('#fR', m).value.trim() || null, memo: $('#fM', m).value.trim() || null };
      if (a) { row.score = num('#fSc'); row.done = $('#fDone', m).checked; if (row.done !== a.done) row.done_at = row.done ? new Date().toISOString() : null; }
      const btn = $('#fGo', m); btn.disabled = true; btn.textContent = pending.length ? '사진 올리는 중…' : '저장 중…';
      try {
        let rec = a ? await D.update(a.id, row) : await D.add(row);
        if (pending.length || (v.drop || []).length) {
          const files = (v.files || []).slice();
          for (let i = 0; i < pending.length; i++) { btn.textContent = `사진 올리는 중… (${i + 1}/${pending.length})`; files.push(await D.upload(rec.id, pending[i].file, pending[i].tag)); }
          for (const p of v.drop || []) await D.removeFile(p);
          rec = await D.update(rec.id, { files });
        }
        const i = S.list.findIndex(x => x.id === rec.id); if (i >= 0) S.list[i] = rec; else S.list.push(rec);
        m.remove(); toast(a ? '저장했어요' : '과제를 추가했어요'); draw();
      } catch (e) { toast(e.message, 3500); btn.disabled = false; btn.textContent = a ? '저장' : '추가'; }
    };
  }

  /* ---------- 자세히 ---------- */
  async function detail(a) {
    const s = sub(a);
    const m = modal(`<div class="hwd"><div class="hdh">${chip(a)}<span class="hk">${esc(a.kind)}</span><span class="hd ${a.done ? 'ok' : dleft(a) != null && dleft(a) <= 3 ? 'hot' : ''}">${a.done ? '제출함' : dTxt(a)}</span></div>
      <h3>${esc(a.title)}</h3>
      <dl class="hdl">${a.due ? `<dt>마감</dt><dd>${QT.prettyDate(a.due).main}</dd>` : ''}${a.points != null ? `<dt>배점</dt><dd>${+a.points}점</dd>` : ''}${a.weight != null ? `<dt>반영 비율</dt><dd>${+a.weight}%</dd>` : ''}${a.score != null ? `<dt>받은 점수</dt><dd><b>${+a.score}${a.points ? ' / ' + +a.points : ''}점</b></dd>` : ''}${a.prep ? `<dt>준비물</dt><dd>${esc(a.prep)}</dd>` : ''}</dl>
      ${a.memo ? `<p class="hmemo">${esc(a.memo).replace(/\n/g, '<br>')}</p>` : ''}
      <div class="hph" id="hPh">${(a.files || []).length ? '<p class="sub">사진 불러오는 중…</p>' : '<p class="sub">아직 올린 사진이 없어요. [수정]에서 안내문을 찍어 두면 나중에 다시 볼 수 있어요.</p>'}</div>
      ${(a.files || []).length ? `<button class="btn acc hmk" id="hMk">📝 이 자료로 문제지 만들기</button>` : ''}
      ${a.item_id ? `<a class="btn hmk" href="/#/item/${esc(a.item_id)}">📚 만든 학습 보기${a.item_title ? ` · ${esc(a.item_title)}` : ''}</a>` : ''}
      <div class="mbtns"><button class="btn danger" id="hDel">삭제</button><button class="btn" id="hEd">수정</button><button class="btn ${a.done ? '' : 'acc'}" id="hCk">${a.done ? '제출 취소' : '✓ 제출했어요'}</button></div>
      <button class="xclose" data-close aria-label="닫기">✕</button></div>`);
    m.classList.add('hwm');
    $('#hEd', m).onclick = () => { m.remove(); form(a); };
    $('#hCk', m).onclick = async () => { try { Object.assign(a, await D.update(a.id, { done: !a.done, done_at: !a.done ? new Date().toISOString() : null })); m.remove(); toast(a.done ? '제출 완료! 👏' : '제출 취소했어요'); draw(); } catch (e) { toast(e.message); } };
    $('#hDel', m).onclick = async () => { if (!confirm(`"${a.title}" 과제를 지울까요? 올린 사진도 같이 지워져요.`)) return; try { await D.remove(a); S.list = S.list.filter(x => x.id !== a.id); m.remove(); toast('지웠어요'); draw(); } catch (e) { toast(e.message); } };
    const mk = $('#hMk', m); if (mk) mk.onclick = () => { location.href = '/#/lib/hw/' + a.id; };
    if ((a.files || []).length) {
      try {
        const u = await D.urls(a.files);
        $('#hPh', m).innerHTML = a.files.map(f => { const url = u[f.path]; const pdf = /pdf/.test(f.type || '') || /\.pdf$/i.test(f.name);
          return `<a class="hpi" href="${esc(url || '#')}" target="_blank" rel="noopener"><span class="hpt">${esc(f.tag || '자료')}</span>${pdf ? '<div class="pdf">PDF</div>' : `<img src="${esc(url || '')}" alt="${esc(f.name)}" loading="lazy">`}<small>${esc(f.name)}</small></a>`; }).join('');
      } catch (e) { $('#hPh', m).innerHTML = `<p class="err">사진을 불러오지 못했어요: ${esc(e.message)}</p>`; }
    }
  }

  /* 홈 화면용: 마감 7일 안의 해야 할 과제 */
  async function soon() {
    const t = todayKey(), e = shiftKey(t, 7);
    return must(await sb().from('tools_assignments').select('id,kind,title,due,subject,subject_id,done').eq('done', false).gte('due', t).lte('due', e).order('due'));
  }

  QT.HW = { render, D, soon };
})();
