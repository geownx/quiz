/* 공부도구 서비스 워커: 홈 화면 앱으로 빨리 열리고, 인터넷이 잠깐 끊겨도 화면이 뜨게 해요.
   파일을 고치면 아래 VERSION 숫자를 올려 주세요. */
const VERSION = 'qt-v5';
const SHELL = [
  '/tools/', '/tools/common.css', '/tools/common.js',
  '/tools/checklist/', '/tools/checklist/data.js', '/tools/quotes.js', '/tools/school/', '/tools/school/school.js', '/tools/timer/', '/tools/timer/timer.js',
  '/tools/manifest.webmanifest', '/tools/icons/icon-192.png',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (/supabase\.co$/.test(url.hostname)) return;              // 로그인·데이터는 항상 서버에서
  const mine = url.origin === location.origin && url.pathname.startsWith('/tools/');
  const cdn = url.hostname === 'cdn.jsdelivr.net';
  if (!mine && !cdn) return;
  // 먼저 서버에서 받고(항상 최신), 안 되면 저장해 둔 것으로
  e.respondWith(fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: mine }).then(r => r || (req.mode === 'navigate' ? caches.match('/tools/') : Response.error()))));
});
