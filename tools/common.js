/* =============================================================
   문제지메이커 · 공부도구 공용 코드
   - 메인(index.html)과 같은 Supabase 프로젝트 · 같은 로그인 세션을 써요
   - 새 도구(급식 등)를 만들 때도 이 파일을 그대로 불러 쓰면 돼요
   ============================================================= */
'use strict';
(function () {
  /* 메인 index.html 의 CONFIG 와 같은 값 */
  const CONFIG = {
    SUPABASE_URL: 'https://acpeizbniyvbohkgaazz.supabase.co',
    SUPABASE_KEY: 'sb_publishable_GnxzDEJCIZZBX-CSxHjtjQ_W7F7276e',
  };
  const SB_ORIGIN = new URL(CONFIG.SUPABASE_URL).origin;
  const FN_URL = SB_ORIGIN + '/functions/v1/api';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  /* ---------- 날짜 (기기 시간 기준) ---------- */
  const toKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayKey = () => toKey(new Date());
  const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const shiftKey = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return toKey(d); };
  const isKey = k => /^\d{4}-\d{2}-\d{2}$/.test(k || '');
  function prettyDate(k) {
    const d = parseKey(k), w = '일월화수목금토'[d.getDay()];
    const diff = Math.round((d - parseKey(todayKey())) / 86400000);
    const rel = diff === 0 ? '오늘' : diff === -1 ? '어제' : diff === 1 ? '내일' : '';
    return { main: `${d.getMonth() + 1}월 ${d.getDate()}일 (${w})`, rel };
  }

  /* ---------- 알림 · 모달 ---------- */
  function toast(msg, ms = 2400) {
    $$('.toast').forEach(t => t.remove());
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.append(t); setTimeout(() => t.remove(), ms);
  }
  function modal(html) {
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div class="box">${html}</div>`;
    m.onclick = e => { if (e.target === m || e.target.closest('[data-close]')) m.remove(); };
    document.body.append(m); return m;
  }

  /* ---------- Supabase (메인과 같은 세션 저장소를 공유) ---------- */
  let SB = null;
  function sb() {
    if (SB) return SB;
    if (!window.supabase) throw new Error('로그인 도구를 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침 해 주세요.');
    SB = window.supabase.createClient(SB_ORIGIN, CONFIG.SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    return SB;
  }
  async function session() {
    try { const { data } = await sb().auth.getSession(); return (data && data.session) || null; } catch (e) { return null; }
  }
  /* 메인 서버의 회원 정보 (이름 · 승인 상태 · 관리자 여부) */
  async function fetchMe(token) {
    const res = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CONFIG.SUPABASE_KEY, Authorization: 'Bearer ' + token }, body: JSON.stringify({ action: 'me' }) });
    let j = null; try { j = await res.json(); } catch (e) {}
    if (!res.ok || (j && j.error)) { const e = new Error((j && j.error && j.error.message) || '서버 오류'); e.code = j && j.error && j.error.code; throw e; }
    return j || {};
  }

  /* 문제지메이커 서버 API (학습 목록 · 문제지 등) */
  async function api(action, data = {}) {
    const s = await session(); if (!s) { const e = new Error('로그인이 필요해요'); e.code = 'QM_AUTH'; throw e; }
    let res; try { res = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CONFIG.SUPABASE_KEY, Authorization: 'Bearer ' + s.access_token }, body: JSON.stringify({ action, ...data }) }); }
    catch (e) { throw new Error('인터넷 연결을 확인해 주세요.'); }
    let j = null; try { j = await res.json(); } catch (e) {}
    if (!res.ok || (j && j.error)) { const e = new Error((j && j.error && j.error.message) || `서버 오류 (${res.status})`); e.code = j && j.error && j.error.code; throw e; }
    return j;
  }

  /* ---------- 헤더 · 푸터 ---------- */

  /* 위 메뉴 · 폰 아래 탭바는 nav.js (메인과 같이 씀) */
  function renderHeader(page, me) {
    const active = page === 'hub' ? 'home' : page;
    if (window.QTNAV) QTNAV.render({ active, tabs: !!me, right: me ? `<a class="qn-ib" href="/#/me" title="내 계정" aria-label="내 계정">${QTNAV.userIcon}</a>` : `<a class="qn-pill acc" href="/#/">로그인</a>` });
    const f = document.createElement('footer'); f.className = 'site';
    f.innerHTML = `© 2026 문제지메이커 · 제작자 <b>geownx</b>${me && me.email ? `<br><span style="font-size:12px">${esc(me.name || '')} ${esc(me.email)} 계정에 저장돼요</span>` : ''}`;
    document.body.append(f);
  }

  /* ---------- 로그인 확인 ----------
     반환: { user, me } 또는 null (로그인 안내 화면을 그림) */
  function gate(root, icon, title, text, btnLabel, onBtn) {
    root.innerHTML = `<div class="wrap" style="max-width:480px"><div class="card gate"><div class="gi">${icon}</div><b>${esc(title)}</b><p>${text}</p>
      ${btnLabel ? `<button class="btn acc" id="gGo" style="width:100%">${esc(btnLabel)}</button>` : ''}</div></div>`;
    const b = $('#gGo', root); if (b) b.onclick = onBtn;
  }
  function goLogin() {
    // 메인에서 로그인이 끝나면 지금 보던 공부도구 화면으로 돌아와요
    LS.set('qm_after_login', { to: location.pathname + location.search, at: Date.now() });
    location.href = '/#/';
  }
  async function boot(page) {
    const root = $('#app');
    root.innerHTML = '<div class="loadingdot"><div class="spin"></div>불러오는 중…</div>';
    let s;
    try { sb(); s = await session(); } catch (e) { renderHeader(page); gate(root, '⚠️', '불러오지 못했어요', esc(e.message)); return null; }
    if (!s) {
      renderHeader(page);
      gate(root, '🔐', '로그인이 필요해요', '문제지메이커 계정으로 로그인하면<br>기록이 계정에 저장돼서 폰·PC 어디서든 이어서 볼 수 있어요.', '문제지메이커로 로그인하기', goLogin);
      return null;
    }
    let me = LS.get('qt_me_' + s.user.id, null) || {};
    try { me = await fetchMe(s.access_token); LS.set('qt_me_' + s.user.id, { name: me.name, email: me.email, status: me.status, role: me.role }); }
    catch (e) {
      if (e.code === 'QM_AUTH') { renderHeader(page); gate(root, '🔐', '다시 로그인해 주세요', '로그인이 만료됐어요.', '문제지메이커로 로그인하기', goLogin); return null; }
      // 인터넷이 끊겼을 때는 마지막으로 확인한 정보로 계속 써요
    }
    renderHeader(page, { name: me.name, email: me.email || s.user.email });
    if (me.status === 'pending' || me.status === 'blocked') {
      gate(root, me.status === 'pending' ? '⏳' : '🔒', me.status === 'pending' ? '가입 확인 중이에요' : '이용할 수 없는 계정이에요',
        me.status === 'pending' ? '문제지메이커에서 가입 확인이 끝나면 바로 쓸 수 있어요.' : '지금은 이 계정으로 이용할 수 없어요.', '문제지메이커로 가기', () => { location.href = '/#/'; });
      return null;
    }
    // 다른 탭에서 로그아웃하면 이 화면도 로그인 안내로 바꿔요
    sb().auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') location.reload(); });
    return { user: s.user, me };
  }

  /* ---------- 홈 화면 앱 (PWA) ---------- */
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; document.dispatchEvent(new Event('qt-installable')); });
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function registerSW() {
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/tools/sw.js', { scope: '/tools/' }).catch(() => {});
  }
  /* 설치 안내 카드 (이미 앱으로 열었거나 '닫기'를 누르면 안 보여요) */
  function installCard(box) {
    if (!box || isStandalone() || LS.get('qt_install_hide', 0) > Date.now()) return;
    const draw = () => {
      const can = !!deferredPrompt, ios = isIOS();
      if (!can && !ios) { box.innerHTML = ''; return; }
      box.innerHTML = `<div class="install"><span class="ii">📌</span><div><b>홈 화면에 추가하기</b>앱처럼 바로 열어서 오늘 할 일을 체크할 수 있어요.</div>
        <button class="btn sm" id="qtInst">${can ? '설치' : '방법 보기'}</button><button class="btn sm ghost" id="qtInstX" aria-label="닫기" style="color:inherit">✕</button></div>`;
      $('#qtInstX', box).onclick = () => { LS.set('qt_install_hide', Date.now() + 14 * 86400e3); box.innerHTML = ''; };
      $('#qtInst', box).onclick = async () => {
        if (deferredPrompt) { deferredPrompt.prompt(); try { const r = await deferredPrompt.userChoice; if (r.outcome === 'accepted') box.innerHTML = ''; } catch (e) {} deferredPrompt = null; return; }
        modal(`<h3>아이폰 홈 화면에 추가</h3><p class="sub" style="margin:4px 0 0">Safari에서 해 주세요. (카카오톡 안에서 열었다면 오른쪽 아래 ⋯ → 'Safari로 열기')</p>
          <ol class="ios-steps"><li>아래쪽 <b>공유 버튼</b> (□↑) 누르기</li><li><b>홈 화면에 추가</b> 고르기</li><li>오른쪽 위 <b>추가</b> 누르기</li></ol>
          <button class="btn pri" data-close style="width:100%;margin-top:14px">알겠어요</button>`);
      };
    };
    draw(); document.addEventListener('qt-installable', draw);
  }

  /* Supabase 오류를 사람이 읽을 수 있게 + 원래 오류도 짧게 붙여요 */
  function dbErr(e, what) {
    const m = String((e && e.message) || e || ''), code = (e && e.code) || '';
    const raw = `${code ? code + ' ' : ''}${m}`.slice(0, 120);
    if (code === 'PGRST106' || /Invalid schema|schema must be one of/i.test(m)) return `Supabase에서 public 스키마가 Data API에 열려 있지 않아요. (Project Settings → Data API 확인) [${raw}]`;
    if (code === 'PGRST205' || code === '42P01' || /relation .* does not exist|Could not find the table|schema cache/i.test(m)) return `서버에서 ${what} 테이블을 못 찾았어요. SQL 실행 · Data API 설정을 확인해 주세요. [${raw}]`;
    if (code === '42501' || /permission denied|row-level security/i.test(m)) return `권한이 없어요. 다시 로그인하거나 SQL의 권한 부분을 확인해 주세요. [${raw}]`;
    if (/JWT|not authorized/i.test(m)) return '로그인이 만료됐어요. 다시 로그인해 주세요.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return '인터넷 연결을 확인해 주세요.';
    if (/duplicate key|unique/i.test(m)) return '이미 있는 이름이에요.';
    return m || '잠시 후 다시 시도해 주세요.';
  }

  /* 시험 D-day → 내 학습 고르기 → '시험 대비' 설정으로 문제지 만들기 화면 */
  async function examPicker(examTitle) {
    const m = modal(`<h3>📝 ${esc(examTitle)} 대비 문제지</h3><p class="sub" style="margin:4px 0 10px">어떤 학습으로 만들까요? 고르면 30문제 · 난이도 섞어서 · 학교 내신 스타일로 준비돼요.</p><div id="epL"><div class="loadingdot" style="padding:30px 0"><div class="spin"></div></div></div>`);
    let list = [];
    try { list = (await api('items')).filter(x => x.status === 'ready'); } catch (e) { $('#epL', m).innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
    if (!list.length) { $('#epL', m).innerHTML = `<p class="note">분석이 끝난 학습이 아직 없어요. 시험 범위 자료를 먼저 올려 주세요.</p><a class="btn acc" href="/#/lib/cam" style="width:100%;margin-top:12px">📷 자료 올리러 가기</a>`; return; }
    $('#epL', m).innerHTML = `<div class="eplist">${list.slice(0, 30).map(x => `<div class="epi" data-id="${esc(x.id)}"><div><b>${esc(x.title)}</b><span>${x.subject && x.subject !== x.title ? esc(x.subject) + ' · ' : ''}파트 ${x.parts || 0}개</span></div>
      <div class="epb"><button class="btn sm" data-k="solve">사이트에서 풀기</button><button class="btn sm acc" data-k="pdf">PDF</button></div></div>`).join('')}</div>`;
    $$('.epi [data-k]', m).forEach(b => b.onclick = () => {
      LS.set('qm_preset', { total: 30, difficulty: 'mixed', style: 'school', title: `${examTitle} 대비`, at: Date.now() });
      location.href = `/#/new/${b.closest('.epi').dataset.id}/${b.dataset.k}`;
    });
  }

  /* '공부' 안에서 할 일 · 타이머 · 기록 전환 */
  function studySwitch(el, on) {
    if (!el) return;
    el.innerHTML = `<nav class="ssw">${[['todo', '할 일', '/tools/checklist/'], ['timer', '타이머', '/tools/timer/'], ['stats', '기록', '/tools/timer/?tab=stats']].map(([k, l, h]) => `<a href="${h}" data-k="${k}" class="${k === on ? 'on' : ''}">${l}</a>`).join('')}</nav>`;
  }

  window.QT = { studySwitch, examPicker, api, dbErr, CONFIG, $, $$, esc, LS, toast, modal, sb, boot, todayKey, shiftKey, parseKey, prettyDate, isKey, registerSW, installCard, isStandalone };
})();
