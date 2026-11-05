// 离线缓存：仅在通过 http(s) 访问时生效（file:// 打开不会注册 Service Worker）。
// 策略：network-first —— 在线时永远取最新文件，离线才回退到缓存。
const CACHE = 'bazi-v4';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './lib/astro.js',
  './lib/constants.js',
  './lib/jieqi.js',
  './lib/lunar.js',
  './lib/shensha.js',
  './lib/analysis.js',
  './lib/bazi.js',
  './lib/config.js',
  './lib/deepseek.js',
  './data/jieqi.js',
  './data/cities.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // 只缓存本站资源，API 请求原样放行
  if (new URL(e.request.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html'))),
  );
});
