/* 문제지메이커 서비스 워커 (사이트 전체)
   - 컴퓨터 · 폰에 앱으로 설치할 수 있게 하고, 인터넷이 잠깐 끊겨도 화면이 뜨게 해요.
   - 파일을 고치면 아래 VERSION 숫자를 올려 주세요. */
const VERSION = 'qm-v8';
const SHELL = ['/', '/tools/', '/tools/common.css', '/tools/nav.css', '/tools/nav.js', '/tools/common.js', '/tools/checklist/', '/tools/checklist/data.js',
  '/tools/quotes.js', '/tools/school/', '/tools/school/school.js', '/tools/timer/', '/tools/timer/timer.js', '/tools/sound.js', '/tools/theme.js', '/tools/badges.js', '/tools/school/hw.js', '/tools/school/grade.js', '/tools/manifest.webmanifest', '/tools/icons/icon-192.png', '/favicon.svg'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (/supabase\.co$/.test(url.hostname)) return;                 // 로그인 · 데이터는 항상 서버에서
  const mine = url.origin === location.origin, cdn = url.hostname === 'cdn.jsdelivr.net';
  if (!mine && !cdn) return;
  // 먼저 서버에서 받고(항상 최신), 안 되면 저장해 둔 것으로
  // 파일은 매번 '바뀌었는지' 서버에 물어봐요 (안 바뀌었으면 금방 끝나요) → 올린 즉시 반영
  const get = mine && req.mode !== 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req);
  e.respondWith(get.then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: mine }).then(r => r || (req.mode === 'navigate' ? caches.match(url.pathname.startsWith('/tools/') ? '/tools/' : '/') : Response.error()))));
});

// 뽀모도로 알림을 누르면 타이머 화면으로
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => x.url.includes('/tools/timer')) || cs[0];
    if (c) { c.focus(); if (!c.url.includes('/tools/timer') && c.navigate) c.navigate('/tools/timer/'); return; }
    return self.clients.openWindow('/tools/timer/');
  }));
});
