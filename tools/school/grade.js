/* 학교생활 · 성적 — 고교학점제(성취도 A~E + 석차 5등급) · 중학교(성취도) 성적 기록과 등급 계산기
   등급 기준(5등급제): 누적 비율 1등급 10% · 2등급 34% · 3등급 66% · 4등급 90% · 5등급 100%
     등급별 마지막 석차 = 수강자 수 × 누적 비율 (반올림) — 예) 96명: 10 · 33 · 63 · 86등까지
     동석차는 중간석차 = 석차 + (동석차 인원 − 1) ÷ 2 로 비교
   성취도: 90↑ A · 80↑ B · 70↑ C · 60↑ D · 40↑ E · 40 미만 I(미이수) / 체육 · 예술 · 과학탐구실험은 A · B · C */
'use strict';
(function () {
  const { $, $$, esc, toast, modal, sb, LS } = QT;
  const must = ({ data, error }) => { if (error) throw new Error(QT.dbErr(error, '성적')); return data; };
  const CUT = [10, 34, 66, 90];
  const KIND = { rank: '성취도 + 등급', ae: '성취도 A~E', abc: '성취도 A·B·C', p: '이수(P)' };
  const GRP = ['국어', '수학', '영어', '사회', '과학', '한국사', '역사', '도덕', '정보·기술', '제2외국어·한문', '체육', '예술', '교양', '기타'];
  // 2022 개정: 사회 · 과학 융합 선택 9과목은 석차등급 없이 성취도만
  const FUSION = ['여행지리', '역사로 탐구하는 현대 세계', '사회문제 탐구', '금융과 경제생활', '윤리문제 탐구', '기후변화와 지속가능한 세계', '과학의 역사와 문화', '기후변화와 환경생태', '융합과학 탐구'];
  const NAMES = ['공통국어1', '공통국어2', '공통수학1', '공통수학2', '공통영어1', '공통영어2', '한국사1', '한국사2', '통합사회1', '통합사회2', '통합과학1', '통합과학2', '과학탐구실험1', '과학탐구실험2',
    '화법과 언어', '독서와 작문', '문학', '주제 탐구 독서', '문학과 영상', '직무 의사소통', '대수', '미적분Ⅰ', '확률과 통계', '기하', '미적분Ⅱ', '경제 수학', '인공지능 수학', '직무 수학',
    '영어Ⅰ', '영어Ⅱ', '영어 독해와 작문', '영미 문학 읽기', '영어 발표와 토론', '심화 영어', '직무 영어', '세계시민과 지리', '세계사', '사회와 문화', '현대사회와 윤리', '한국지리 탐구', '도시의 미래 탐구', '동아시아 역사 기행', '정치', '법과 사회', '경제', '윤리와 사상', '인문학과 윤리', '국제 관계의 이해',
    '물리학', '화학', '생명과학', '지구과학', '역학과 에너지', '전자기와 양자', '물질과 에너지', '화학 반응의 세계', '세포와 물질대사', '생물의 유전', '지구시스템과학', '행성우주과학',
    '정보', '인공지능 기초', '데이터 과학', '한문', '중국어', '일본어', '스페인어', '프랑스어', '독일어', '체육1', '체육2', '음악', '미술', '진로와 직업', '생태와 환경'].concat(FUSION);
  const MID = ['국어', '수학', '영어', '사회', '역사', '도덕', '과학', '기술·가정', '정보', '체육', '음악', '미술', '한문', '중국어', '일본어'];
  function guess(name, mid) {
    const n = String(name || '').replace(/\s/g, '');
    const g = /국어|문학|독서|화법|언어|작문/.test(n) ? '국어' : /수학|대수|미적분|확률|기하/.test(n) ? '수학' : /영어|영미/.test(n) ? '영어' : /한국사/.test(n) ? '한국사' : /역사/.test(n) && mid ? '역사' : /도덕/.test(n) ? '도덕'
      : /과학|물리|화학|생명|지구|물질|에너지|세포|유전|행성|역학|전자기/.test(n) ? '과학' : /사회|지리|세계사|윤리|정치|법|경제|역사|도시|관계/.test(n) ? '사회' : /정보|기술|인공지능|데이터/.test(n) ? '정보·기술'
      : /한문|중국어|일본어|스페인어|프랑스어|독일어|외국어/.test(n) ? '제2외국어·한문' : /체육|운동|스포츠/.test(n) ? '체육' : /음악|미술|연극|예술/.test(n) ? '예술' : /진로|교양|생태|논리|철학|심리|보건/.test(n) ? '교양' : '기타';
    let kind = 'rank';
    if (mid) kind = ['체육', '예술'].includes(g) ? 'abc' : 'ae';
    else if (FUSION.some(f => f.replace(/\s/g, '') === n)) kind = 'ae';
    else if (/과학탐구실험/.test(n) || ['체육', '예술'].includes(g)) kind = 'abc';
    else if (g === '교양') kind = 'p';
    return { grp: g, kind, credits: null }; // 학점은 학교 편제표마다 달라서 학생이 직접 넣어요
  }

  /* ---------- 계산 ---------- */
  const r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100;
  function fromParts(parts) { // 원점수(100점 환산) · 입력된 비율 · 남은 비율
    let got = 0, wDone = 0, wAll = 0;
    (parts || []).forEach(p => { const w = +p.w || 0; wAll += w; if (p.s !== '' && p.s != null && +p.m) { got += (+p.s / +p.m) * w; wDone += w; } });
    return { got, wDone, wAll, raw: wDone ? got * (wAll > 100 ? 100 / wAll : 1) : null };
  }
  const rawOf = g => { const f = fromParts(g.parts); return f.wDone && f.wDone >= f.wAll - 0.01 ? r2(f.raw) : g.raw != null ? +g.raw : (f.wDone ? r2(f.got) : null); };
  const achOf = (raw, kind) => raw == null ? null : kind === 'abc' ? (raw >= 80 ? 'A' : raw >= 60 ? 'B' : 'C') : kind === 'p' ? 'P' : raw >= 90 ? 'A' : raw >= 80 ? 'B' : raw >= 70 ? 'C' : raw >= 60 ? 'D' : raw >= 40 ? 'E' : 'I';
  const midRank = g => +g.rank + ((+g.ties || 1) - 1) / 2;
  function pctOf(g) { if (!g.rank || !g.students) return null; return midRank(g) / +g.students * 100; }
  const cutCounts = N => CUT.map(c => Math.round(N * c / 100));            // 등급별 마지막 석차 (반올림)
  function gradeOfRank(g) { if (!g.rank || !g.students) return null; const m = midRank(g), cc = cutCounts(+g.students); const i = cc.findIndex(c => m <= c); return i < 0 ? 5 : i + 1; }
  const gradeFromPct = p => p == null ? null : (CUT.findIndex(c => p <= c) + 1) || 5;
  const finalGrade = g => g.kind !== 'rank' ? null : g.grade ? +g.grade : gradeOfRank(g);
  const finalAch = g => g.ach || achOf(rawOf(g), g.kind);
  function avg(list) {
    let s = 0, c = 0; list.forEach(g => { const gr = finalGrade(g); if (gr) { const w = +g.credits || 1; s += gr * w; c += w; } });
    return c ? r2(s / c) : null;
  }
  const termKey = g => `${g.year}-${g.term}`;
  const TERMS = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2'];

  /* ---------- 데이터 ---------- */
  const D = {
    async list() { return must(await sb().from('tools_grades').select('*').order('year').order('term').order('created_at')); },
    async save(id, row) { row.updated_at = new Date().toISOString(); return must(await (id ? sb().from('tools_grades').update(row).eq('id', id) : sb().from('tools_grades').insert(row)).select().single()); },
    async addMany(rows) { return must(await sb().from('tools_grades').insert(rows).select()); },
    async remove(id) { must(await sb().from('tools_grades').delete().eq('id', id)); },
  };

  const S = { list: [], term: null, mid: false, box: null, hw: [] };
  async function render(box, ctx, profile) {
    S.box = box;
    const saved = LS.get('qt_gr_level', null);
    S.mid = saved ? saved === 'mid' : !!(profile && profile.school_kind === '중학교');
    box.innerHTML = '<div class="loadingdot"><div class="spin"></div>불러오는 중…</div>';
    try { S.list = await D.list(); } catch (e) {
      box.innerHTML = `<div class="card"><b class="err">성적을 불러오지 못했어요</b><p class="sub" style="margin:6px 0 0">${esc(e.message)}</p>${/relation|schema cache|PGRST205|tools_grades/.test(e.message) ? '<p class="sub">Supabase에서 <b>supabase_stage3.sql</b>을 실행하면 생겨요.</p>' : ''}</div>`;
      return;
    }
    try { S.hw = QT.HW ? await QT.HW.D.list() : []; } catch (e) { S.hw = []; }
    S.uid = ctx.user.id;
    if (!S.term) { const last = S.list.length ? termKey(S.list[S.list.length - 1]) : (profile && profile.grade ? `${Math.min(3, +profile.grade)}-${(new Date().getMonth() + 1) >= 3 && (new Date().getMonth() + 1) <= 7 ? 1 : 2}` : '1-1'); S.term = last; }
    draw(); autoSeed();
  }

  function draw() {
    const box = S.box, mid = S.mid, L = S.list.filter(g => termKey(g) === S.term);
    const ranks = S.list.filter(g => g.kind === 'rank' && finalGrade(g));
    const all = avg(S.list), termAvg = avg(L);
    const credits = S.list.reduce((a, g) => a + (+g.credits || 0), 0);
    const raws = L.map(rawOf).filter(x => x != null), rawAvg = raws.length ? r1(raws.reduce((a, b) => a + b, 0) / raws.length) : null;
    const dist = { A: 0, B: 0, C: 0, D: 0, E: 0, I: 0 }; S.list.forEach(g => { const a = finalAch(g); if (a && dist[a] != null) dist[a]++; });
    box.innerHTML = `
      <div class="grtop"><div class="seg" id="grLv"><button data-l="high" class="${mid ? '' : 'on'}">고등학교</button><button data-l="mid" class="${mid ? 'on' : ''}">중학교</button></div>
        <span class="sub">${mid ? '중학교는 성취도(A~E)로 기록돼요' : '고교학점제: 성취도(A~E) + 석차 5등급'}</span></div>
      <div class="grs">
        ${mid ? `<div class="card gsum"><span>전체 성취도</span><div class="gdist">${Object.entries(dist).filter(([k, n]) => k !== 'I' || n).map(([k, n]) => `<div><b>${n}</b><i>${k}</i></div>`).join('')}</div></div>
                <div class="card gsum"><span>${S.term.replace('-', '학년 ')}학기 평균 원점수</span><b class="gbig">${rawAvg ?? '-'}</b><small>${raws.length}과목</small></div>`
              : `<div class="card gsum"><span>전체 내신 평균 등급</span><b class="gbig">${all ?? '-'}<em>${all ? '등급' : ''}</em></b><small>등급 나오는 ${ranks.length}과목 · 학점으로 가중 평균${ranks.some(g => !g.credits) ? ` · <b class="gnc">${ranks.filter(g => !g.credits).length}과목 학점 입력 전 (1학점으로 계산 중)</b>` : ''}</small></div>
                <div class="card gsum"><span>${S.term.replace('-', '학년 ')}학기 평균</span><b class="gbig">${termAvg ?? '-'}<em>${termAvg ? '등급' : ''}</em></b><small>평균 원점수 ${rawAvg ?? '-'}</small></div>
                <div class="card gsum"><span>이수 학점</span><b class="gbig">${r1(credits)}<em>/ 174</em></b><div class="gbar"><i style="width:${Math.min(100, credits / 174 * 100)}%"></i></div><small>교과 174 + 창체 18 = 졸업 192학점</small></div>`}
      </div>
      <div class="card gchart"><div class="ch"><b>📈 학기별 ${mid ? '평균 원점수' : '평균 등급'}</b></div>${chart()}</div>
      <div class="gterms" id="grT">${TERMS.map(t => { const n = S.list.filter(g => termKey(g) === t).length; return `<button data-t="${t}" class="${t === S.term ? 'on' : ''}">${t.replace('-', '학년 ')}학기${n ? `<small>${n}</small>` : ''}</button>`; }).join('')}</div>
      <div class="card"><div class="ch"><b>${S.term.replace('-', '학년 ')}학기 과목</b><div class="gact">${L.length ? '' : `<button class="btn sm" id="grPre">기본 과목 넣기</button>`}<button class="btn sm acc" id="grAdd">＋ 과목</button></div></div>
        <div id="grL">${L.length ? L.map(rowHTML).join('') : `<p class="empty2">${mid ? '과목이 없어요. [기본 과목 넣기]나 [＋ 과목]으로 넣어요' : '과목이 없어요. [기본 과목 넣기]나 [＋ 과목]으로 넣어요'}</p>`}</div></div>
      <p class="note">${mid ? '중학교 성취도: 90점↑ A · 80↑ B · 70↑ C · 60↑ D · 그 아래 E (체육 · 음악 · 미술은 A · B · C). 과목은 학교마다 배우는 학년이 달라서, 안 배우는 과목은 지우고 필요한 과목은 [＋ 과목]으로 더해요.' : '등급별 마지막 석차 = 수강자 수 × 누적 비율(1등급 10% · 2등급 34% · 3등급 66% · 4등급 90%)을 반올림한 값이에요. 동석차는 중간석차로 비교해요. 성취도는 90 · 80 · 70 · 60 · 40점 기준 A~E, 40점 미만은 I(미이수)예요. 사회 · 과학 융합 선택, 체육 · 예술, 과학탐구실험, 교양은 성취도만 나와서 평균 등급에서 빠져요. 학교마다 반올림 · 동점 처리가 조금 다를 수 있어요.'}</p>`;
    $$('#grLv button', box).forEach(b => b.onclick = () => { S.mid = b.dataset.l === 'mid'; LS.set('qt_gr_level', b.dataset.l); draw(); autoSeed(); });
    $$('#grT button', box).forEach(b => b.onclick = () => { S.term = b.dataset.t; draw(); autoSeed(); });
    $('#grAdd', box).onclick = () => form(null);
    const pre = $('#grPre', box); if (pre) pre.onclick = () => preset(false);
    $$('.grow', box).forEach(el => el.onclick = () => form(S.list.find(g => g.id === el.dataset.id)));
  }
  function rowHTML(g) {
    const raw = rawOf(g), ach = finalAch(g), gr = finalGrade(g), f = fromParts(g.parts);
    const partial = f.wAll && f.wDone < f.wAll - 0.01;
    return `<button class="grow" data-id="${g.id}">
      <div class="gn"><b>${esc(g.name)}</b><small>${esc(g.grp || '')}${g.credits ? ` · ${+g.credits}학점` : S.mid ? '' : ' · <em class="gnc">학점 입력 전</em>'} · ${KIND[g.kind]}</small></div>
      <div class="gv">${raw != null ? `<span class="graw">${r1(raw)}<small>${partial ? `점 · ${f.wDone}% 반영` : '점'}</small></span>` : ''}
        ${ach ? `<span class="gach a-${ach}">${ach}</span>` : ''}${g.kind === 'rank' ? `<span class="ggr ${gr ? 'g' + gr : ''}">${gr ? gr + '등급' : '등급 -'}</span>` : ''}</div></button>`;
  }
  function chart() {
    const pts = TERMS.map(t => { const L = S.list.filter(g => termKey(g) === t); const raws = L.map(rawOf).filter(x => x != null); return { t, v: S.mid ? (raws.length ? raws.reduce((a, b) => a + b, 0) / raws.length : null) : avg(L) }; }).filter(p => p.v != null);
    if (!pts.length) return '<p class="empty2">성적을 넣으면 학기별로 그래프가 그려져요</p>';
    const W = 560, H = 190, l = 40, r = 16, t = 16, b = 30, xs = i => l + (pts.length === 1 ? (W - l - r) / 2 : i * (W - l - r) / (pts.length - 1));
    const lo = S.mid ? Math.max(0, Math.floor(Math.min(...pts.map(p => p.v)) / 10) * 10 - 10) : 1, hi = S.mid ? 100 : 5;
    const ys = v => S.mid ? t + (hi - v) / (hi - lo) * (H - t - b) : t + (v - lo) / (hi - lo) * (H - t - b); // 등급은 1이 위
    const ticks = S.mid ? [lo, (lo + hi) / 2, hi] : [1, 2, 3, 4, 5];
    return `<svg viewBox="0 0 ${W} ${H}" class="gsvg" role="img" aria-label="학기별 ${S.mid ? '평균 원점수' : '평균 등급'}">
      ${ticks.map(v => `<line x1="${l}" x2="${W - r}" y1="${ys(v)}" y2="${ys(v)}" class="gl"/><text x="${l - 8}" y="${ys(v) + 4}" text-anchor="end" class="gt">${S.mid ? Math.round(v) : v + '등급'}</text>`).join('')}
      <polyline points="${pts.map((p, i) => `${xs(i)},${ys(p.v)}`).join(' ')}" class="gp"/>
      ${pts.map((p, i) => `<circle cx="${xs(i)}" cy="${ys(p.v)}" r="5" class="gc"/><text x="${xs(i)}" y="${ys(p.v) - 11}" text-anchor="middle" class="gv2">${S.mid ? r1(p.v) : r2(p.v)}</text><text x="${xs(i)}" y="${H - 8}" text-anchor="middle" class="gt">${p.t.replace('-', '-')}</text>`).join('')}</svg>`;
  }
  /* 학년 · 학기 기본 과목 — 1학년은 전국 공통과목, 2 · 3학년은 대표 선택과목(학교마다 달라서 고쳐 쓰기) */
  function defaults(mid, y, t) {
    if (mid) return ['국어', '수학', '영어', y === 1 ? '사회' : '역사', '과학', '도덕', '기술·가정', '체육', '음악', '미술'];
    if (y === 1) return ['공통국어', '공통수학', '공통영어', '한국사', '통합사회', '통합과학', '과학탐구실험'].map(n => n + t).concat(['체육' + t]);
    return ({ '2-1': ['문학', '대수', '영어Ⅰ', '사회와 문화', '생명과학', '운동과 건강'],
              '2-2': ['독서와 작문', '미적분Ⅰ', '영어Ⅱ', '세계시민과 지리', '지구과학', '음악'],
              '3-1': ['화법과 언어', '확률과 통계', '영어 독해와 작문', '현대사회와 윤리', '물리학', '진로와 직업'],
              '3-2': ['주제 탐구 독서', '기하', '심화 영어', '정치', '화학', '미술'] })[`${y}-${t}`] || [];
  }
  async function preset(silent) {
    const [y, tm] = S.term.split('-').map(Number);
    const names = defaults(S.mid, y, tm);
    if (!names.length) return silent ? null : form(null);
    try {
      const rows = names.map(n => Object.assign({ year: y, term: tm, name: n, parts: [] }, guess(n, S.mid)));
      if (S.mid) rows.forEach(r => { r.credits = null; });
      S.list = S.list.concat(await D.addMany(rows));
      if (!silent) toast(`${rows.length}과목을 넣었어요`);
      draw();
    } catch (e) { if (!silent) toast(e.message); }
  }
  /* 빈 학기를 처음 열면 기본 과목을 알아서 넣어 둬요 (한 번만 · 지운 과목은 다시 안 넣어요) */
  async function autoSeed() {
    const k = `qt_gr_seed_${S.uid}_${S.mid ? 'm' : 'h'}_${S.term}`;
    if (S.list.some(g => termKey(g) === S.term) || LS.get(k, false)) return false;
    LS.set(k, true); await preset(true); return true;
  }

  /* ---------- 과목 입력 · 계산기 ---------- */
  function form(g) {
    const [y, tm] = S.term.split('-').map(Number);
    const v = g ? JSON.parse(JSON.stringify(g)) : Object.assign({ year: y, term: tm, name: '', parts: [] }, guess('', S.mid), { kind: S.mid ? 'ae' : 'rank', credits: null });
    if (!v.parts || !v.parts.length) v.parts = [{ n: '중간고사', w: 30, s: '', m: 100 }, { n: '기말고사', w: 40, s: '', m: 100 }, { n: '수행평가', w: 30, s: '', m: 100 }];
    let mode = g && (g.rank || g.students || g.grade || g.ach) && !fromParts(g.parts).wDone ? 'card' : (LS.get('qt_gr_mode', 'score'));
    const m = modal(`<div class="grf"><h3>${g ? '과목 수정' : '과목 추가'} <small>${S.term.replace('-', '학년 ')}학기</small></h3>
      <div class="f2"><div style="flex:2"><label class="lb">과목</label><input type="text" id="gN" list="gNames" maxlength="40" placeholder="예: 공통수학1, 한문, 정보" value="${esc(v.name)}"><datalist id="gNames">${(S.mid ? MID : NAMES).map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
        ${S.mid ? '' : `<div><label class="lb">학점</label><input type="number" id="gC" inputmode="decimal" step="0.5" min="0" max="10" placeholder="편제표 보고" value="${v.credits ?? ''}"></div>`}</div>
      <div class="f2"><div><label class="lb">교과(군)</label><select id="gG">${GRP.map(x => `<option ${x === v.grp ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
        <div><label class="lb">평가 방식</label><select id="gK">${Object.entries(KIND).filter(([k]) => !S.mid || k !== 'rank').map(([k, l]) => `<option value="${k}" ${k === v.kind ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="gmode"><button data-m="score" class="${mode === 'score' ? 'on' : ''}">📝 점수로 계산</button><button data-m="card" class="${mode === 'card' ? 'on' : ''}">📄 성적표 보고 입력</button></div>
      <div id="gBody"></div>
      <div class="gres" id="gRes"></div>
      <div class="mbtns">${g ? '<button class="btn danger" id="gDel">삭제</button>' : ''}<button class="btn" data-close>취소</button><button class="btn acc" id="gGo">저장</button></div></div>`);
    m.classList.add('grm');
    const body = $('#gBody', m);
    const num = x => x === '' || x == null || isNaN(+x) ? null : +x;
    function drawBody() {
      if (mode === 'score') {
        const hw = S.hw.filter(a => a.score != null && a.points && ((a.subject || '').replace(/\s/g, '') && (v.name || '').replace(/\s/g, '').includes((a.subject || '').replace(/\s/g, '').slice(0, 2))));
        body.innerHTML = `<p class="sub">시험 · 수행 점수와 반영 비율을 넣으면 원점수와 성취도가 나와요. 아직 안 본 시험은 비워 두면 목표 점수를 계산해 줘요.</p>
          <div class="gparts">${v.parts.map((p, i) => `<div class="gpart" data-i="${i}"><input type="text" data-k="n" value="${esc(p.n)}" maxlength="20" aria-label="이름">
            <label><input type="number" data-k="s" inputmode="decimal" value="${p.s ?? ''}" placeholder="점수"><span>/</span><input type="number" data-k="m" inputmode="decimal" value="${p.m ?? 100}" aria-label="만점"></label>
            <label class="gw"><input type="number" data-k="w" inputmode="decimal" value="${p.w ?? ''}" aria-label="반영 비율"><span>%</span></label><button type="button" class="gx" data-x="${i}" aria-label="빼기">✕</button></div>`).join('')}</div>
          <div class="gpb"><button type="button" class="btn sm" id="gPA">＋ 평가 추가</button>${hw.length ? `<button type="button" class="btn sm" id="gHW">과제 탭 점수 ${hw.length}개 불러오기</button>` : ''}</div>
          ${v.kind === 'rank' ? `<details class="gmore" ${v.rank || v.students ? 'open' : ''}><summary>석차 · 수강자 수도 알면 등급까지</summary>${rankInputs()}</details>` : ''}`;
        $$('.gpart input', body).forEach(inp => inp.oninput = () => { const p = v.parts[+inp.closest('.gpart').dataset.i]; p[inp.dataset.k] = inp.dataset.k === 'n' ? inp.value : (inp.value === '' ? '' : +inp.value); calc(); });
        $$('[data-x]', body).forEach(b => b.onclick = () => { v.parts.splice(+b.dataset.x, 1); drawBody(); calc(); });
        $('#gPA', body).onclick = () => { v.parts.push({ n: '수행평가', w: 10, s: '', m: 100 }); drawBody(); calc(); };
        const gh = $('#gHW', body); if (gh) gh.onclick = () => {
          v.parts = v.parts.filter(p => !/수행/.test(p.n) || p.s !== '');
          hw.forEach(a => { if (!v.parts.some(p => p.n === a.title)) v.parts.push({ n: a.title.slice(0, 20), w: +a.weight || 10, s: +a.score, m: +a.points }); });
          drawBody(); calc(); toast('과제 점수를 넣었어요. 반영 비율을 확인해 주세요');
        };
      } else {
        body.innerHTML = `<p class="sub">성적표(나이스 · 가정통신문)에 적힌 값을 그대로 넣어요. 아는 칸만 채워도 돼요.</p>
          <div class="f3"><div><label class="lb">원점수</label><input type="number" id="gRaw" inputmode="decimal" value="${v.raw ?? ''}"></div><div><label class="lb">과목 평균</label><input type="number" id="gAvg" inputmode="decimal" value="${v.avg ?? ''}"></div>
            <div><label class="lb">성취도</label><select id="gAch"><option value="">자동</option>${(v.kind === 'abc' ? ['A', 'B', 'C'] : v.kind === 'p' ? ['P'] : ['A', 'B', 'C', 'D', 'E', 'I']).map(x => `<option ${x === v.ach ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
          ${v.kind === 'rank' ? rankInputs(true) : ''}`;
        const bind = (id, k) => { const el = $(id, body); if (el) el.oninput = el.onchange = () => { v[k] = el.tagName === 'SELECT' ? (el.value || null) : num(el.value); calc(); }; };
        bind('#gRaw', 'raw'); bind('#gAvg', 'avg'); bind('#gAch', 'ach');
      }
      bindRank(); calc();
    }
    function rankInputs(withGrade) {
      return `<div class="f3"><div><label class="lb">석차</label><input type="number" id="gRk" inputmode="numeric" value="${v.rank ?? ''}"></div><div><label class="lb">동석차 인원</label><input type="number" id="gTi" inputmode="numeric" placeholder="없으면 비움" value="${v.ties ?? ''}"></div><div><label class="lb">수강자 수</label><input type="number" id="gSt" inputmode="numeric" value="${v.students ?? ''}"></div></div>
        ${withGrade ? `<div class="f3"><div><label class="lb">석차등급 (성적표)</label><select id="gGr"><option value="">자동</option>${[1, 2, 3, 4, 5].map(x => `<option value="${x}" ${+v.grade === x ? 'selected' : ''}>${x}등급</option>`).join('')}</select></div></div>` : ''}`;
    }
    function bindRank() {
      [['#gRk', 'rank'], ['#gTi', 'ties'], ['#gSt', 'students']].forEach(([id, k]) => { const el = $(id, m); if (el) el.oninput = () => { v[k] = num(el.value); calc(); }; });
      const gg = $('#gGr', m); if (gg) gg.onchange = () => { v.grade = num(gg.value); calc(); };
    }
    function calc() {
      const f = fromParts(v.parts), useParts = mode === 'score' && f.wDone;
      const raw = useParts ? (f.wDone >= f.wAll - 0.01 ? r2(f.raw) : null) : v.raw;
      const ach = (mode === 'card' && v.ach) || achOf(raw, v.kind), pc = pctOf(v), gr = v.kind === 'rank' ? ((mode === 'card' && v.grade) || gradeOfRank(v)) : null;
      let html = '<div class="grr">';
      html += `<div><span>원점수</span><b>${raw != null ? r1(raw) : useParts ? `${r1(f.got)}<small> / ${f.wDone}%</small>` : '-'}</b></div>`;
      html += `<div><span>성취도</span><b class="a-${ach || ''}">${ach || '-'}</b></div>`;
      if (v.kind === 'rank') html += `<div><span>석차등급</span><b>${gr ? gr + '등급' : '-'}</b>${pc != null ? `<small>상위 ${r1(pc)}%</small>` : ''}</div>`;
      html += '</div>';
      if (v.kind === 'rank' && v.students) {
        const N = +v.students, cc = cutCounts(N); html += `<p class="gcut">수강자 ${N}명 기준: ${cc.map((c, i) => `<b>${i + 1}등급</b> ${c}등까지`).join(' · ')} · <b>5등급</b> 그 아래${v.ties > 1 ? ` <br>동석차 ${v.ties}명이면 중간석차 ${midRank(v)}등으로 비교해요` : ''}</p>`;
      }
      // 목표 역산: 비운 평가에서 몇 점 필요한지
      if (mode === 'score' && f.wAll) {
        const left = v.parts.filter(p => (p.s === '' || p.s == null) && +p.w), wl = left.reduce((a, p) => a + (+p.w || 0), 0);
        if (left.length && wl) {
          const scale = f.wAll > 100 ? 100 / f.wAll : 1, cuts = v.kind === 'abc' ? [['A', 80], ['B', 60]] : [['A', 90], ['B', 80], ['C', 70], ['D', 60]];
          html += `<div class="gtg"><b>🎯 남은 ${left.map(p => esc(p.n)).join(' · ')}에서 필요한 점수</b>${cuts.map(([k, c]) => { const need = (c / scale - f.got) / wl * 100; return `<div><span class="gach a-${k}">${k}</span>${need <= 0 ? '이미 확보! 🎉' : need > 100 ? '<span class="sub">남은 점수로는 어려워요</span>' : `평균 <b>${Math.ceil(need)}점</b> 이상 (100점 만점 기준)`}</div>`; }).join('')}</div>`;
        }
      }
      $('#gRes', m).innerHTML = html;
      v._raw = raw;
    }
    $$('.gmode button', m).forEach(b => b.onclick = () => { mode = b.dataset.m; LS.set('qt_gr_mode', mode); $$('.gmode button', m).forEach(x => x.classList.toggle('on', x === b)); drawBody(); });
    $('#gN', m).onchange = () => { const nm = $('#gN', m).value.trim(); if (!g && nm) { const q = guess(nm, S.mid); v.grp = q.grp; v.kind = q.kind; $('#gG', m).value = q.grp; $('#gK', m).value = q.kind; drawBody(); } v.name = nm; drawBody(); };
    $('#gK', m).onchange = () => { v.kind = $('#gK', m).value; drawBody(); };
    drawBody();
    const del = $('#gDel', m); if (del) del.onclick = async () => { if (!confirm(`${g.name} 성적을 지울까요?`)) return; try { await D.remove(g.id); S.list = S.list.filter(x => x.id !== g.id); m.remove(); draw(); } catch (e) { toast(e.message); } };
    $('#gGo', m).onclick = async () => {
      const name = $('#gN', m).value.trim(); if (!name) return toast('과목 이름을 적어 주세요');
      const c = $('#gC', m);
      const row = { year: v.year, term: v.term, name, grp: $('#gG', m).value, kind: $('#gK', m).value, credits: c ? num(c.value) : null,
        parts: mode === 'score' ? v.parts.filter(p => p.n || p.s !== '') : (g ? g.parts : []),
        raw: mode === 'score' ? (v._raw ?? null) : num(v.raw), avg: num(v.avg), students: num(v.students), rank: num(v.rank), ties: num(v.ties),
        grade: mode === 'card' ? num(v.grade) : null, ach: mode === 'card' ? (v.ach || null) : null };
      const btn = $('#gGo', m); btn.disabled = true;
      try { const rec = await D.save(g && g.id, row); const i = S.list.findIndex(x => x.id === rec.id); if (i >= 0) S.list[i] = rec; else S.list.push(rec); m.remove(); toast('저장했어요'); draw(); }
      catch (e) { toast(e.message); btn.disabled = false; }
    };
  }

  QT.GR = { render, calc: { gradeOfRank, cutCounts, achOf, fromParts, avg }, defaults };
})();
