/* 문제지메이커 공용 메뉴 · 다크모드 — 메인(index.html)과 공부도구 페이지가 같이 써요
   QTNAV.render({ active, right, tabs }) 로 위 메뉴 + 폰 아래 탭바를 그려요 */
'use strict';
(function () {
  const S = (p, w = 22) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const IC = {
    home: S('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>'),
    maker: S('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15l2 2 4-4"/>'),
    checklist: S('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
    timer: S('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M9 2h6"/>'),
    school: S('<path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11"/><path d="M10 21v-5h4v5"/>'),
    user: S('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  };
  const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#5B6CFF"/><g transform="rotate(-8 30 34)"><rect x="15" y="13" width="28" height="36" rx="4" fill="#fff" opacity=".45"/></g><path d="M21 12h17l8 8v29a3 3 0 0 1-3 3H21a3 3 0 0 1-3-3V15a3 3 0 0 1 3-3z" fill="#fff"/><path d="M38 12v6a2 2 0 0 0 2 2h6z" fill="#C9CFFF"/><rect x="23" y="24" width="15" height="3" rx="1.5" fill="#1D1F27"/><rect x="23" y="31" width="18" height="2.6" rx="1.3" fill="#1D1F27" opacity=".28"/><rect x="23" y="37" width="12" height="2.6" rx="1.3" fill="#1D1F27" opacity=".28"/><circle cx="44.5" cy="45.5" r="10.5" fill="#1D1F27" stroke="#5B6CFF" stroke-width="3"/><path d="M39.6 45.6l3.3 3.3 6.4-6.6" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const TABS = [
    { k: 'home', l: '홈', href: '/tools/' },
    { k: 'maker', l: '문제지', href: '/#/lib' },
    { k: 'checklist', l: '체크리스트', s: '체크', href: '/tools/checklist/' },
    { k: 'timer', l: '타이머', href: '/tools/timer/' },
    { k: 'school', l: '학교생활', s: '학교', href: '/tools/school/' },
  ];
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };

  /* 다크모드: 직접 고른 값 → 없으면 기기 설정 */
  function isDark() { const v = ls.get('qt_theme'); return v != null ? v === '1' : matchMedia('(prefers-color-scheme: dark)').matches; }
  function applyTheme(dark) {
    document.body.classList.toggle('dark', dark);
    const tc = document.querySelector('meta[name=theme-color]'); if (tc) tc.content = dark ? '#14151b' : '#f6f7fb';
    const b = document.getElementById('qnTheme'); if (b) b.textContent = dark ? '☀️' : '🌙';
  }
  applyTheme(isDark());

  let opts = {};
  function render(o) {
    opts = Object.assign({ active: '', right: '', tabs: true }, o || {});
    let h = document.getElementById('qnHead');
    if (!h) { h = document.createElement('header'); h.id = 'qnHead'; h.className = 'qn'; document.body.prepend(h); }
    const tabs = opts.tabs ? TABS : [];
    h.innerHTML = `<div class="in">
      <a class="qn-logo" href="/" aria-label="문제지메이커 홈">${LOGO}<span>문제지<b>메이커</b></span></a>
      ${tabs.length ? `<nav class="qn-tabs" aria-label="메뉴">${tabs.map(t => `<a href="${t.href}" class="${t.k === opts.active ? 'on' : ''} ${t.k === 'maker' ? 'maker' : ''}">${IC[t.k]}${t.l}</a>`).join('')}</nav>` : ''}
      <div class="qn-right" id="qnRight">${opts.right || ''}<button class="qn-ib" id="qnTheme" type="button" title="다크모드" aria-label="다크모드">${isDark() ? '☀️' : '🌙'}</button></div></div>`;
    document.getElementById('qnTheme').onclick = () => { const d = !document.body.classList.contains('dark'); applyTheme(d); ls.set('qt_theme', d ? '1' : '0'); };
    let bar = document.getElementById('qnBar');
    if (tabs.length) {
      if (!bar) { bar = document.createElement('nav'); bar.id = 'qnBar'; bar.className = 'qn-bar'; bar.setAttribute('aria-label', '아래 메뉴'); document.body.append(bar); }
      bar.innerHTML = tabs.map(t => `<a href="${t.href}" class="${t.k === opts.active ? 'on' : ''} ${t.k === 'maker' ? 'maker' : ''}">${t.k === 'maker' ? `<span class="ic">${IC.maker}</span>` : IC[t.k]}<span>${t.s || t.l}</span></a>`).join('');
      document.body.classList.add('qn-has-bar');
    } else { if (bar) bar.remove(); document.body.classList.remove('qn-has-bar'); }
    if (opts.onRight) opts.onRight(document.getElementById('qnRight'));
  }

  /* =============== 앱으로 설치 (PWA) — 메인 · 공부도구 같이 씀 ===============
     폰은 홈 화면에, 컴퓨터는 앱(작업 표시줄 · Dock)으로. 이미 설치한 사람에게는 안 보여요.
     '설치했다'는 이렇게 알아내요:
       1) 지금 앱으로 열려 있음 (standalone) → 기억해 둠
       2) 이 브라우저에서 설치함 (appinstalled 이벤트 · 크롬 계열의 '설치된 앱' 확인)
       3) 이 계정이 같은 종류 기기(아이폰 · 안드로이드 · 컴퓨터)에서 앱으로 연 적 있음 (계정에 기록)
          → 아이폰은 앱과 Safari의 저장 공간이 따로라서 이 방법이 꼭 필요해요
     단, 크롬 · 엣지가 '이 브라우저에 설치 가능'이라고 알려주면 이 기기엔 없는 거라 [설치] 버튼을 보여요. */
  const UA = navigator.userAgent || '';
  const DEV = (() => {
    const ios = /iPhone|iPad|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const android = /Android/i.test(UA);
    return {
      ios, android, ipad: ios && !/iPhone|iPod/.test(UA), kind: ios ? 'ios' : android ? 'android' : 'desktop', mobile: ios || android,
      kakao: /KAKAOTALK/i.test(UA),
      inapp: /KAKAOTALK|Instagram|FBAN|FBAV|NAVER\(inapp|Line\/|DaumApps|everytimeApp|BAND\/|; wv\)/i.test(UA),
      samsung: /SamsungBrowser/i.test(UA), edge: /Edg(e|A|iOS)?\//.test(UA), firefox: /Firefox|FxiOS/.test(UA),
      crios: /CriOS/.test(UA), whale: /Whale/i.test(UA),
      macSafari: !ios && /Macintosh/.test(UA) && /Safari/.test(UA) && !/Chrome|Chromium|Edg|Firefox|Whale/.test(UA),
    };
  })();
  const INST = 'qt_app_installed_' + DEV.kind, HIDE = 'qt_install_hide';
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true;
  let bip = null, ACC = null, accChecked = null;
  const boxes = new Set();
  const redraw = () => boxes.forEach(b => draw(b));
  /* 계정 기록 연결: 각 페이지가 로그인한 뒤 QTNAV.setAccount({ get, mark }) 로 알려줘요 */
  function setAccount(acc) {
    ACC = acc; accChecked = null;
    if (isStandalone()) markInstalled(); else redraw();
  }
  function markInstalled() {
    ls.set(INST, String(Date.now()));
    if (ACC && ACC.mark) Promise.resolve(ACC.mark(DEV.kind)).catch(() => {});
  }
  if (isStandalone()) ls.set(INST, String(Date.now()));
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); bip = e; redraw(); });
  window.addEventListener('appinstalled', () => { bip = null; markInstalled(); redraw(); if (window.QTLOG) QTLOG.add('login', 'login', 'appinstalled', '앱 설치함', null, true, { dedupe: 'inst' }); });
  async function installedSomewhere() {
    if (isStandalone()) { markInstalled(); return true; }
    if (ls.get(INST)) return true;
    try { if (navigator.getInstalledRelatedApps) { const r = await navigator.getInstalledRelatedApps(); if (r && r.length) { ls.set(INST, String(Date.now())); return true; } } } catch (e) {}
    if (ACC && ACC.get) {
      if (!accChecked) accChecked = Promise.resolve(ACC.get()).then(m => !!(m && m[DEV.kind])).catch(() => false);
      if (await accChecked) { ls.set(INST, String(Date.now())); return true; }
    }
    return false;
  }
  /* 기기 · 브라우저별 설치 방법 */
  function steps() {
    const here = location.origin + (location.pathname === '/' ? '/' : location.pathname) + location.search;
    if (DEV.inapp) {
      const open = DEV.kakao ? `kakaotalk://web/openExternal?url=${encodeURIComponent(here)}`
        : DEV.android ? `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;end` : '';
      return { t: '앱 안 브라우저에서는 설치가 안 돼요', d: `${DEV.kakao ? '카카오톡' : '지금 앱'} 안에서 열린 화면이라 설치할 수 없어요. ${DEV.ios ? 'Safari' : '크롬'}로 열어서 설치해 주세요.`,
        list: DEV.ios ? ['오른쪽 아래(또는 위) <b>⋯ / 공유</b> 버튼', '<b>Safari로 열기</b> (다른 브라우저로 열기)', 'Safari에서 이 안내를 다시 따라 하기'] : ['오른쪽 위 <b>⋮</b> 버튼', '<b>다른 브라우저로 열기</b> → 크롬', '크롬에서 이 안내를 다시 따라 하기'],
        btn: open ? { label: `${DEV.ios ? 'Safari' : '크롬'}로 열기`, href: open } : null, copy: here };
    }
    if (DEV.ios) return DEV.crios || DEV.edge || DEV.firefox
      ? { t: `${DEV.ipad ? '아이패드' : '아이폰'} 홈 화면에 추가`, d: '지금 브라우저에서도 돼요. (안 보이면 Safari에서 해 주세요)', list: ['주소창 옆 <b>공유 버튼</b> (□↑)', '<b>홈 화면에 추가</b>', '오른쪽 위 <b>추가</b>'] }
      : { t: `${DEV.ipad ? '아이패드' : '아이폰'} 홈 화면에 추가`, d: 'Safari에서 세 번만 누르면 돼요.', list: [`${DEV.ipad ? '위쪽' : '아래쪽'} <b>공유 버튼</b> (□↑)`, '메뉴를 내려서 <b>홈 화면에 추가</b>', '오른쪽 위 <b>추가</b> → 홈 화면에 아이콘이 생겨요'] };
    if (DEV.android) return DEV.samsung
      ? { t: '안드로이드 홈 화면에 추가', d: '삼성 인터넷에서는 이렇게 해요.', list: ['아래쪽 <b>≡</b> 메뉴', '<b>현재 페이지 추가</b> → <b>홈 화면</b>', '<b>추가</b>'] }
      : { t: '안드로이드 홈 화면에 앱 설치', d: '크롬에서 이렇게 해요.', list: ['오른쪽 위 <b>⋮</b> 메뉴', '<b>앱 설치</b> (또는 <b>홈 화면에 추가</b>)', '<b>설치</b> → 홈 화면과 앱 목록에 아이콘이 생겨요'] };
    if (DEV.firefox) return { t: '컴퓨터에 앱으로 설치', d: 'Firefox는 웹 앱 설치를 지원하지 않아요. 크롬이나 엣지로 quizmaker.pro에 들어가서 설치해 주세요.', list: ['크롬 또는 엣지 열기', 'quizmaker.pro 들어가기', '이 안내의 <b>설치</b> 버튼 누르기'], copy: 'https://quizmaker.pro' };
    if (DEV.macSafari) return { t: '맥에 앱으로 설치 (Dock에 추가)', d: 'Safari 17 이상(macOS Sonoma 이상)에서 돼요.', list: ['위쪽 메뉴 <b>파일</b>', '<b>Dock에 추가…</b>', '<b>추가</b> → Dock과 런치패드에 아이콘이 생겨요'] };
    if (DEV.edge) return { t: '컴퓨터에 앱으로 설치', d: '엣지에서 이렇게 해요.', list: ['주소창 오른쪽 <b>앱 설치 아이콘</b>(⊞) 또는 오른쪽 위 <b>⋯</b>', '<b>앱</b> → <b>이 사이트를 앱으로 설치</b>', '<b>설치</b> → 작업 표시줄에 고정하면 더 편해요'] };
    return { t: '컴퓨터에 앱으로 설치', d: '크롬 · 웨일에서 이렇게 해요.', list: ['주소창 오른쪽 <b>설치 아이콘</b>(모니터 모양) 누르기', '안 보이면 오른쪽 위 <b>⋮</b> → <b>전송, 저장, 공유</b> → <b>페이지를 앱으로 설치</b>', '<b>설치</b> → 작업 표시줄(맥은 Dock)에 고정하면 더 편해요'] };
  }
  function howModal() {
    const g = steps(), d = document.createElement('div'); d.className = 'qi-modal';
    d.innerHTML = `<div class="qi-box" role="dialog" aria-label="${g.t}"><h3>${g.t}</h3><p class="qi-n" style="margin:0 0 8px">${g.d}</p><ol>${g.list.map(x => `<li>${x}</li>`).join('')}</ol>
      ${g.btn ? `<a class="qi-btn" href="${g.btn.href}" style="display:block;text-align:center;text-decoration:none;margin-top:14px">${g.btn.label}</a>` : ''}
      ${g.copy ? `<button class="qi-btn ghost" data-a="copy" style="width:100%;margin-top:10px">주소 복사</button>` : ''}
      <div class="qi-row" style="margin-top:10px"><button class="qi-btn ghost" data-a="done">이미 설치했어요</button><button class="qi-btn" data-a="close">알겠어요</button></div></div>`;
    d.onclick = async e => {
      const a = e.target.closest('[data-a]');
      if (e.target === d || (a && a.dataset.a === 'close')) d.remove();
      if (a && a.dataset.a === 'done') { markInstalled(); d.remove(); redraw(); }
      if (a && a.dataset.a === 'copy') { try { await navigator.clipboard.writeText(g.copy); a.textContent = '복사했어요 ✓'; } catch (x) { window.prompt('이 주소를 복사해 주세요', g.copy); } }
    };
    document.body.append(d);
  }
  const IC_PHONE = S('<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>', 22);
  const IC_PC = S('<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>', 22);
  async function draw(box) {
    if (!box.isConnected) { boxes.delete(box); return; }
    const hidden = +(ls.get(HIDE) || 0) > Date.now();
    // 크롬 계열이 '설치 가능'이라고 알려주면 = 이 브라우저엔 없음 → 버튼 보이기
    const show = !hidden && !isStandalone() && (bip ? true : !(await installedSomewhere()));
    if (!show) { box.innerHTML = ''; return; }
    const pc = !DEV.mobile;
    box.innerHTML = `<div class="qi"><span class="qi-ic">${pc ? IC_PC : IC_PHONE}</span><div class="qi-tx"><b>${pc ? '컴퓨터에 앱으로 설치' : DEV.ios ? '홈 화면에 앱으로 추가' : '홈 화면에 앱으로 설치'}</b><span>${pc ? '작업 표시줄이나 Dock에서 바로 열 수 있어요.' : '앱처럼 바로 열고, 주소창 없이 넓게 써요.'}</span></div>
      <button class="qi-btn" data-a="go">${bip ? '설치' : DEV.inapp ? '열기 방법' : '방법 보기'}</button><button class="qi-x" data-a="x" aria-label="닫기" title="30일 동안 안 보기">✕</button></div>`;
    box.querySelector('[data-a=x]').onclick = () => { ls.set(HIDE, String(Date.now() + 30 * 86400e3)); redraw(); };
    box.querySelector('[data-a=go]').onclick = async () => {
      if (bip) { const ev = bip; bip = null; ev.prompt(); try { const r = await ev.userChoice; if (window.QTLOG) if (r.outcome === 'accepted') QTLOG.add('login', 'login', 'install_prompt', '앱 설치함', null, true, { dedupe: 'inst' }); if (r.outcome === 'accepted') markInstalled(); } catch (e) {} redraw(); return; }
      howModal();
    };
  }
  function installCard(box) { if (!box) return; boxes.add(box); draw(box); }


  /* ===== 활동 기록 (관리자 화면에서 봐요) =====
     로그인한 회원이 한 일을 qm_logs 테이블에 남겨요. 브라우저에 먼저 모아 두었다가 몇 초마다 한꺼번에 보내고,
     인터넷이 끊기거나 창을 닫아도 다음에 열 때 이어서 보내요. 비밀번호 · 파일 내용은 남기지 않아요. */
  const QTLOG = (() => {
    const QK = 'qt_log_q', LK = 'qt_log_lock', PK = 'qt_log_login', MAXQ = 400;
    const PARTS = [['login', '로그인 · 접속'], ['maker', '문제지'], ['checklist', '체크리스트'], ['timer', '타이머'], ['school', '학교생활']];
    let client = null, user = null, timer = null, busy = false, off = false, pre = [];
        const ss = { get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} } };
    let sid = ss.get('qt_log_sid'); if (!sid) { sid = Math.random().toString(36).slice(2, 10); ss.set('qt_log_sid', sid); }
    const browser = DEV.kakao ? '카카오톡' : DEV.inapp ? '앱 안 브라우저' : DEV.samsung ? '삼성 인터넷' : DEV.edge ? 'Edge' : DEV.whale ? '웨일' : DEV.firefox ? 'Firefox' : (DEV.crios || /Chrome/.test(UA)) ? 'Chrome' : /Safari/.test(UA) ? 'Safari' : '기타 브라우저';
    const device = `${DEV.ipad ? '아이패드' : DEV.ios ? '아이폰' : DEV.android ? (/Mobile/.test(UA) ? '안드로이드' : '안드로이드 태블릿') : /Mac/.test(UA) ? 'Mac' : /Windows/.test(UA) ? 'Windows' : /CrOS/.test(UA) ? '크롬북' : 'PC'} · ${browser}`;
    const area = () => { const p = location.pathname; if (p.startsWith('/tools/checklist')) return 'checklist'; if (p.startsWith('/tools/timer')) return 'timer'; if (p.startsWith('/tools/school')) return 'school'; if (p.startsWith('/tools')) return 'home'; return /^#\/admin/.test(location.hash) ? 'admin' : 'maker'; };
    const page = () => (location.pathname + location.search + location.hash).replace(/(access_token|refresh_token|code)=[^&]+/g, '$1=…').slice(0, 250);
    const load = () => { try { const old = Date.now() - 25 * 86400e3; return JSON.parse(localStorage.getItem(QK) || '[]').filter(x => Date.parse(x.created_at) > old); } catch (e) { return []; } };
    const save = q => { try { localStorage.setItem(QK, JSON.stringify(q.slice(-MAXQ))); } catch (e) {} };
    const SECRET = /pass|token|b64|base64|dataurl|blob|bytes|secret/i;
    function slim(o, d = 0) {
      if (o == null || typeof o === 'number' || typeof o === 'boolean') return o;
      if (typeof o === 'string') return o.length > 150 ? o.slice(0, 150) + '…' : o;
      if (typeof o !== 'object') return String(o).slice(0, 60);
      if (Array.isArray(o)) return d > 1 ? `[${o.length}개]` : o.slice(0, 12).map(x => slim(x, d + 1)).concat(o.length > 12 ? [`…외 ${o.length - 12}개`] : []);
      if (d > 2) return '{…}';
      const r = {}; let n = 0;
      for (const k of Object.keys(o)) { if (SECRET.test(k)) continue; if (++n > 24) { r['…'] = '생략'; break; } r[k] = slim(o[k], d + 1); }
      return r;
    }
    const recent = new Map();
    /* part: 기능 파트 (비우면 지금 화면 기준) · kind: login | view | do | click | error | auth_fail */
    function add(part, kind, action, label, detail, ok = true, opt = {}) {
      if (off) return;
      if (kind !== 'do' && kind !== 'login' && area() === 'admin') return; // 관리자가 기록 화면을 보는 건 안 남겨요
      if (opt.dedupe) { const t = recent.get(opt.dedupe); if (t && Date.now() - t < (opt.gap || 60000)) return; recent.set(opt.dedupe, Date.now()); }
      const e = { uid: user ? user.id : null, created_at: new Date().toISOString(), part: part || area(), kind, action: String(action || '').slice(0, 60), label: String(label || '').replace(/\s+/g, ' ').trim().slice(0, 240),
        detail: detail == null ? null : slim(detail), ok: ok !== false, page: page(), device, app: isStandalone(), sid, name: user ? (user.name || null) : null, email: user ? (user.email || null) : (opt.email || null) };
      // 로그인 확인이 끝나기 전에 한 일은 잠깐 들고 있다가, 로그인이 확인되면 그 회원 기록으로 넣어요
      if (!user && !opt.anon) { pre.push(e); if (pre.length > 40) pre.shift(); return; }
      const q = load(); q.push(e); save(q); schedule(opt.now ? 0 : 4000);
    }
    function schedule(ms) { clearTimeout(timer); timer = setTimeout(flush, ms); }
    async function flush() {
      if (busy || off || !client) return;
      const lock = +(ls.get(LK) || 0); if (lock > Date.now()) return schedule(3000); // 다른 탭이 보내는 중
      let q = load(); const uid = user && user.id;
      const send = q.filter(x => (uid && x.uid === uid) || (!x.uid && x.kind === 'auth_fail')).slice(0, 100);
      if (!send.length) return;
      busy = true; ls.set(LK, String(Date.now() + 10000));
      try {
        const { error } = await client.from('qm_logs').insert(send.map(x => { const r = Object.assign({}, x); delete r.uid; r.user_id = x.uid; return r; }));
        const drop = () => save(load().filter(x => !send.some(y => y.created_at === x.created_at && y.label === x.label && y.uid === x.uid)));
        if (error) {
          const m = (error.code || '') + ' ' + (error.message || '');
          if (/PGRST20|42P01|does not exist|schema cache/i.test(m)) off = true; // 아직 SQL을 안 돌렸으면 이번엔 쉬어요 (모아 둔 건 남겨요)
          else if (/42501|23514|22001|row-level security|violates/i.test(m)) drop(); // 받을 수 없는 기록은 버려요 (계속 막히지 않게)
        }
        else { drop(); if (load().some(x => (uid && x.uid === uid))) schedule(500); }
      } catch (e) {} finally { busy = false; ls.del(LK); }
    }
    /* supabase 클라이언트: 공부도구 테이블에 쓰는 일(추가 · 완료 · 수정 · 삭제)을 자동으로 기록해요.
       완료 · 삭제처럼 id만 오가는 일도 무엇을 했는지 보이게, 불러온 할 일 · 과목 · D-day 이름을 기억해 둬요. */
    const TBL = { tools_tasks: 'checklist', tools_subjects: 'checklist', tools_sessions: 'timer', tools_profile: 'school', tools_ddays: 'school' };
    const NAMES = { tools_tasks: {}, tools_subjects: {}, tools_ddays: {} };
    const remember = (t, data) => { const m = NAMES[t]; if (!m || !data) return; (Array.isArray(data) ? data : [data]).forEach(r => { if (r && r.id) m[r.id] = Object.assign(m[r.id] || {}, r); }); };
    const idOf = b => { try { const v = b && b.url && b.url.searchParams && b.url.searchParams.get('id'); return v ? v.replace(/^eq\./, '') : null; } catch (e) { return null; } };
    const mm = s => s >= 3600 ? `${Math.floor(s / 3600)}시간 ${Math.round(s % 3600 / 60)}분` : `${Math.max(1, Math.round(s / 60))}분`;
    const subj = id => (id && NAMES.tools_subjects[id] && NAMES.tools_subjects[id].name) || '';
    function dbLabel(t, op, v, b) {
      const arr = Array.isArray(v), one = (arr ? v[0] : v) || {}, n = arr ? v.length : 1, keys = Object.keys(one);
      const id = idOf(b), old = (id && NAMES[t] && NAMES[t][id]) || {};
      const sj = x => subj(x.subject_id) ? `[${subj(x.subject_id)}] ` : '';
      if (t === 'tools_tasks') {
        if (op === 'insert') return n > 1 ? `할 일 ${n}개 추가 · ${v.map(x => x.title).slice(0, 3).join(', ')}${n > 3 ? ' 외' : ''}` : `할 일 추가 · ${sj(one)}${one.title || ''}${one.minutes ? ` (${one.minutes}분)` : ''}`;
        if (op === 'update') {
          const nm = old.title || one.title || '(이름 모름)';
          if ('done' in one) return `${one.done ? '할 일 완료' : '완료 취소'} · ${sj(old)}${nm}`;
          return `할 일 수정 · ${old.title && one.title && old.title !== one.title ? `${old.title} → ${one.title}` : nm}${one.minutes ? ` (${one.minutes}분)` : ''}`;
        }
        if (op === 'delete') return /done=eq\.true/.test(String(b && b.url || '')) ? '완료한 할 일 모두 지우기' : `할 일 삭제 · ${old.title || '(이름 모름)'}`;
      }
      if (t === 'tools_subjects') {
        if (op === 'insert') return n > 1 ? null : `과목 추가 · ${one.name || ''}`; // 처음 기본 과목은 자동이라 안 남겨요
        if (op === 'update') return keys.length === 1 && keys[0] === 'sort' ? '과목 순서 바꿈' : old.name && one.name && old.name !== one.name ? `과목 이름 바꿈 · ${old.name} → ${one.name}` : `과목 ${one.color ? '색 바꿈' : '수정'} · ${one.name || old.name || ''}`;
        if (op === 'delete') return `과목 삭제 · ${old.name || ''}`;
      }
      if (t === 'tools_sessions') {
        if (op === 'insert') {
          if (n > 1) return `공부 기록 ${n}개 저장 (인터넷 끊겼을 때 것)`;
          if (one.mode === 'solve') return `문제 풀이 · ${one.ref_title || ''} · ${mm(one.seconds || 0)}${one.q_total ? ` · ${one.q_correct || 0}/${one.q_total} 정답` : ''}`;
          return `공부 시간 · ${subj(one.subject_id) || '과목 없음'} ${mm(one.seconds || 0)} (${one.mode === 'pomodoro' ? '뽀모도로' : '스톱워치'})`;
        }
        if (op === 'delete') return '공부 기록 삭제';
      }
      if (t === 'tools_profile') return `학교 · 반 설정 · ${one.school_name || ''}${one.grade ? ` ${one.grade}학년` : ''}${one.class_nm ? ` ${one.class_nm}반` : ''}`;
      if (t === 'tools_ddays') { if (op === 'insert') return `D-day 추가 · ${one.title || ''} (${one.day || ''})`; if (op === 'delete') return `D-day 삭제 · ${old.title || ''}`; }
      return `${t} ${op}`;
    }
    const hook = (b, fn) => { if (!b || typeof b.then !== 'function') return b; const th = b.then.bind(b); b.then = (res, rej) => th(r => { try { fn(r); } catch (e) {} return res ? res(r) : r; }, rej); return b; };
    function wrap(c) {
      if (!c || c.__qtlog || typeof c.from !== 'function') return c;
      c.__qtlog = true; const orig = c.from.bind(c);
      c.from = t => {
        const qb = orig(t); if (!TBL[t]) return qb;
        const sel = qb.select; if (typeof sel === 'function') qb.select = function (...a) { return hook(sel.apply(qb, a), r => remember(t, r && r.data)); };
        ['insert', 'update', 'upsert', 'delete'].forEach(op => {
          const f = qb[op]; if (typeof f !== 'function') return;
          qb[op] = function (...args) {
            const b = f.apply(qb, args), v = args[0];
            return hook(b, r => {
              const one = (Array.isArray(v) ? v[0] : v) || {};
              if (op === 'update' && Object.keys(one).length === 1 && 'sort' in one) return; // 순서 바꾸기는 남기지 않아요
              const part = t === 'tools_sessions' && one.mode === 'solve' ? 'maker' : TBL[t];
              const lb = dbLabel(t, op, op === 'delete' ? null : v, b), id = idOf(b);
              if (lb === null) return;
              add(part, 'do', `${t}.${op}`, (r && r.error ? '실패 · ' : '') + lb, Object.assign({}, op === 'delete' ? {} : { values: v }, r && r.error ? { error: r.error.message || String(r.error) } : {}), !(r && r.error));
              if (r && !r.error) { if (r.data) remember(t, r.data); if (id && op === 'update' && NAMES[t] && NAMES[t][id]) Object.assign(NAMES[t][id], one); }
            });
          };
        });
        return qb;
      };
      return c;
    }
    function setClient(c) { client = wrap(c); if (user) schedule(1500); return client; }
    function setUser(u) {
      if (!u || !u.id) { user = null; pre = []; return; }
      const first = !user || user.id !== u.id; user = { id: u.id, name: u.name || '', email: u.email || '' };
      if (!first) return;
      if (pre.length) { const q = load(); pre.forEach(e => Object.assign(e, { uid: user.id, name: user.name || null, email: user.email || null })); q.push(...pre); pre = []; save(q); }
      const p = ls.get(PK); let pend = null; try { pend = p && JSON.parse(p); } catch (e) {}
      if (pend && Date.now() - pend.at < 30 * 60e3) {
        ls.del(PK);
        const HOW = { google: '구글', kakao: '카카오', email: '이메일' };
        add('login', 'login', pend.what, `${pend.what === 'signup' ? '회원가입' : '로그인'} (${HOW[pend.how] || pend.how})${isStandalone() ? ' · 앱' : ''}`, { how: pend.how }, true, { now: true });
        ss.set('qt_log_visit_' + u.id, '1');
      } else if (!ss.get('qt_log_visit_' + u.id)) {
        ss.set('qt_log_visit_' + u.id, '1');
        add('login', 'login', 'visit', isStandalone() ? '앱으로 접속' : '접속', { ua: UA.slice(0, 200), screen: `${screen.width}×${screen.height}` });
      }
      schedule(1500);
    }
    const pending = (what, how) => ls.set(PK, JSON.stringify({ what, how, at: Date.now() }));
    const fail = (email, msg, what) => add('login', 'auth_fail', what === 'signup' ? 'signup_fail' : 'login_fail', `${what === 'signup' ? '가입' : '로그인'} 실패: ${msg}`, { email }, false, { anon: true, email, now: true });
    const view = () => {}; // 화면 이동 · 누른 버튼은 남기지 않아요 (한 일만 간단히)
    window.addEventListener('error', e => add(null, 'error', 'js', `화면 오류 · ${e.message || '알 수 없음'}`, { src: String(e.filename || '').slice(-80), line: e.lineno }, false, { dedupe: 'e' + e.message, gap: 30000 }));
    window.addEventListener('unhandledrejection', e => { const m = e.reason && (e.reason.message || String(e.reason)); if (!m || /AbortError/.test(m)) return; add(null, 'error', 'promise', `화면 오류 · ${m}`, null, false, { dedupe: 'p' + m, gap: 30000 }); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    window.addEventListener('online', () => schedule(500));
    return { add, flush, view, setClient, setUser, pending, fail, wrap, PARTS, device, slim };
  })();
  window.QTLOG = QTLOG;
  window.QTNAV = { render, IC, LOGO, isDark, applyTheme, userIcon: IC.user, installCard, setAccount, howModal, isStandalone, markInstalled, DEV };
})();
