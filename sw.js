'use strict';
/* network-first for the app shell so a publish reaches installed phones.
   images are cached for offline use. */
const CACHE = 'entreno-v3';
const SHELL = ['index.html', './'];
const IMAGES = [
  'img/01-sentadilla-goblet_75b3.png',
  'img/02-remo-a-una-mano_74da.png',
  'img/03-press-de-hombros_1a05.png',
  'img/04-swing_5b65.png',
  'img/05-flexiones_9adb.png',
  'img/06-plancha_2259.png',
  'img/07-peso-muerto-rumano_6c0c.png',
  'img/08-zancada-hacia-atras_ef8c.png',
  'img/09-press-de-piso_c5c5.png',
  'img/10-remo-con-banda_9378.png',
  'img/11-puente-de-gluteos_c67f.png',
  'img/12-dead-bug_1bbf.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.concat(IMAGES).map(async (url) => {
      try { await cache.add(url); } catch (_) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function cachedDoc(cache, req) {
  return await cache.match(req)
    || await cache.match('index.html')
    || await cache.match('./index.html')
    || await cache.match('./');
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  if (self.navigator && self.navigator.onLine === false) {
    const hit = await cachedDoc(cache, req);
    if (hit) return hit;
  }
  try {
    const res = await fetch(req);
    if (res && res.ok) await cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cachedDoc(cache, req);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) await cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  const isImage = path.includes('/img/');
  const isDoc = req.mode === 'navigate' || path.endsWith('/index.html') || /\/$/.test(path);
  if (isDoc) {
    event.respondWith(networkFirst(req));
    return;
  }
  if (isImage) event.respondWith(cacheFirst(req));
});
