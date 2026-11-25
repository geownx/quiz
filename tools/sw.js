/* 예전 공부도구 전용 서비스 워커예요. 이제 사이트 전체용 /sw.js 를 써서, 이 파일은 스스로 꺼져요. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('qt-')).map(k => caches.delete(k))))
    .then(() => self.registration.unregister()).then(() => self.clients.matchAll()).then(cs => cs.forEach(c => c.navigate(c.url))));
});
