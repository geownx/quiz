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
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

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
  window.QTNAV = { render, IC, LOGO, isDark, applyTheme, userIcon: IC.user };
})();
