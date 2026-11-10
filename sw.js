/* Offline: app shell precached; map tiles, elevation and water data cached as you view them (cache-first, capped). */
const SHELL = 'swsf-shell-v7', TILES = 'swsf-tiles-v1', DATA = 'swsf-data-v1', MAX_TILES = 6000;
const ASSETS = ['./', 'index.html', 'app.css', 'manifest.webmanifest', 'vendor/maplibre-gl.js', 'vendor/maplibre-gl.css', 'js/db.js', 'js/parse.js', 'js/map.js', 'js/water-worker.js', 'js/views.js', 'js/podcasts.js', 'js/draws.js', 'js/scoring.js', 'state_data.json', 'state_data_east_fallback.json', 'js/app.js', 'design/theme.css', 'design/fonts/Oswald-Variable.ttf', 'design/fonts/Inter-Variable.ttf', 'design/fonts/Inter-Italic-Variable.ttf', 'design/icons/icon-192.png', 'design/icons/icon-512.png', 'design/icons/maskable-192.png', 'design/icons/maskable-512.png', 'design/icons/apple-touch-icon-180.png', 'design/icons/favicon-32.png', 'design/icons/favicon.ico', 'design/splash.png', 'design/splash-1080x1920.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.png', 'icons/logo-header.png', 'icons/logo-large.png'];
const TILE_HOSTS = ['basemap.nationalmap.gov', 'server.arcgisonline.com', 'tile.opentopomap.org', 'tile.openstreetmap.org', 's3.amazonaws.com', 'elevation.nationalmap.gov', 'gis.blm.gov'];
const DATA_HOSTS = ['hydro.nationalmap.gov', 'itunes.apple.com'];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => ![SHELL, TILES, DATA].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
let puts = 0;
async function trim() { const c = await caches.open(TILES); const ks = await c.keys(); if (ks.length > MAX_TILES) for (const k of ks.slice(0, ks.length - MAX_TILES)) await c.delete(k); }
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === location.origin && /state_data[\w-]*\.json$/.test(u.pathname)) { // data files: network-first so refreshes show up right away
    e.respondWith(fetch(req).then(r => { if (r.ok) { const cl = r.clone(); caches.open(SHELL).then(c => c.put(req, cl)); } return r; }).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  if (u.origin === location.origin) { // shell: cache-first, refresh in background
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => { const net = fetch(req).then(r => { if (r.ok) caches.open(SHELL).then(c => c.put(req, r.clone())); return r; }).catch(() => hit); return hit || net; }));
    return;
  }
  if (TILE_HOSTS.includes(u.hostname)) {
    e.respondWith(caches.open(TILES).then(async c => { const hit = await c.match(req); if (hit) return hit; const r = await fetch(req); if (r.ok && (r.type === 'cors' || r.type === 'basic') && !u.pathname.includes('/query')) { c.put(req, r.clone()); if (++puts % 200 === 0) trim(); } return r; }));
    return;
  }
  if (DATA_HOSTS.includes(u.hostname)) { // network-first, fall back to cache when offline
    e.respondWith(fetch(req).then(r => { if (r.ok) { const cl = r.clone(); caches.open(DATA).then(c => c.put(req, cl)); } return r; }).catch(() => caches.match(req)));
  }
});
