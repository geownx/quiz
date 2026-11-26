/* 오늘의 색 — 한국 시간 자정마다 다음 색 조합으로 바뀌어요 (모든 사람이 같은 날 같은 색)
   두 가지 어울리는 색을 섞어서: 첫 색 = 버튼 · 강조색, 두 색 = 큰 카드 그라데이션 · 로고
   인쇄용 PDF · 앱 아이콘 · 검색 미리보기 이미지는 남보라 그대로 둬요. */
(() => {
  const T = [
    ['남보라 × 라벤더', '#5b6cff', '#9a6bff'],
    ['바다 × 민트', '#2a72e5', '#2fb7a3'],
    ['노을 × 벚꽃', '#e8574c', '#e86a9f'],
    ['숲 × 하늘', '#2e8b57', '#3aa6d8'],
    ['라벤더 × 벚꽃', '#7c4ff0', '#e06aa8'],
    ['밤하늘 × 바다', '#3949ab', '#3d8fe6'],
    ['귤 × 노을', '#d9600b', '#ea4f62'],
    ['민트 × 하늘', '#0e8f83', '#4aa8e8'],
    ['벚꽃 × 귤', '#d94a86', '#f08a3c'],
    ['코발트 × 라벤더', '#1d4ed8', '#9a6bff'],
    ['와인 × 노을', '#b0275f', '#f0704f'],
    ['청록 × 숲', '#0f766e', '#4caf6e'],
    ['포도 × 바다', '#8b3fd6', '#3f7ff0'],
    ['밤하늘 × 라벤더', '#2f3d99', '#9563f0'],
    ['자두 × 벚꽃', '#a2268f', '#ee7aa8'],
    ['바다 × 남보라', '#1f6fd1', '#6a6cff'],
  ];
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const out = a => '#' + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const x = hex(a), y = hex(b); return out(x.map((v, i) => v + (y[i] - v) * t)); };
  const vars = o => Object.entries(o).map(([k, v]) => `--${k}:${v}`).join(';');
  const Q = {};
  function apply() {
    const day = Math.floor((Date.now() + 9 * 3600e3) / 864e5);          // 한국 날짜
    const i = ((day % T.length) + T.length) % T.length, [name, a, b] = T[i];
    const mid = mix(a, b, 0.5);
    const L = {
      acc: a, acc2: mix(a, '#ffffff', 0.88), sel: mix(a, '#ffffff', 0.88), bg: mix(mid, '#f7f8fb', 0.94),
      deep: mix(a, '#000000', 0.2), g1: a, g2: b, logo: a, logo2: mix(b, '#ffffff', 0.7),
    };
    const D = {
      acc: mix(a, '#ffffff', 0.3), acc2: mix(a, '#1e2029', 0.78), sel: mix(a, '#1e2029', 0.78), bg: mix(a, '#14151b', 0.95),
      deep: mix(a, '#000000', 0.2), g1: mix(a, '#000000', 0.12), g2: mix(b, '#000000', 0.12), logo: mix(a, '#ffffff', 0.15), logo2: mix(b, '#ffffff', 0.6),
    };
    let s = document.getElementById('qt-theme');
    if (!s) { s = document.createElement('style'); s.id = 'qt-theme'; (document.head || document.documentElement).appendChild(s); }
    s.textContent = `html body{${vars(L)}}html body.dark{${vars(D)}}html body ::selection{background:${a}33}`;
    // 폰 주소창 · 상태바 색도 맞춰요
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', document.body && document.body.classList.contains('dark') ? '#14151b' : L.bg);
    Object.assign(Q, { list: T, index: i, name, light: L, dark: D });
    // 자정이 지나면 열린 화면도 다음 색으로 (새로고침 없이 색만 바꿔요)
    clearTimeout(Q.t); Q.t = setTimeout(apply, (day + 1) * 864e5 - 9 * 3600e3 - Date.now() + 1000);
  }
  apply();
  document.addEventListener('DOMContentLoaded', apply);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') apply(); });
  window.QTTHEME = Q;
})();
