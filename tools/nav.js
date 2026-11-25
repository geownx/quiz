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
  window.addEventListener('appinstalled', () => { bip = null; markInstalled(); redraw(); });
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
      if (bip) { const ev = bip; bip = null; ev.prompt(); try { const r = await ev.userChoice; if (r.outcome === 'accepted') markInstalled(); } catch (e) {} redraw(); return; }
      howModal();
    };
  }
  function installCard(box) { if (!box) return; boxes.add(box); draw(box); }

  window.QTNAV = { render, IC, LOGO, isDark, applyTheme, userIcon: IC.user, installCard, setAccount, howModal, isStandalone, markInstalled, DEV };
})();
