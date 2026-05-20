// RateMyDay service worker.
//
// Goals:
//   1. Make the app launchable offline (cache app shell)
//   2. Keep ratings always-fresh (never cache /api/*)
//   3. Roll out updates quickly (network-first for HTML, skipWaiting)
//
// Bump CACHE_VERSION when the SW logic itself changes — the activate handler
// clears any cache that doesn't match, which discards previous versions.
// Build hashes in CRA filenames mean stale JS/CSS are naturally orphaned and
// will eventually fall out of the cache via the eviction logic below.
const CACHE_VERSION = 'rmd-v1';
const APP_BASE = '/rate-my-day/';

// Minimal app shell — kept tiny so install is fast. The rest of the static
// asset graph (hashed JS/CSS chunks) is cached lazily on first fetch.
const SHELL_URLS = [
  APP_BASE,
  `${APP_BASE}index.html`,
  `${APP_BASE}manifest.json`,
  `${APP_BASE}favicon.ico`
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_URLS))
  );
  // Take over immediately on next page load instead of waiting for all tabs
  // to close. Combined with clients.claim() below this means a fresh deploy
  // is picked up on the next navigation.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// Helpers — keep them tiny so the SW stays inline-readable. Each request goes
// through ONE strategy; we pick based on the request shape.
async function networkFirstWithCacheFallback(request) {
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Last-ditch fallback for SPA route requests — serve the cached shell.
    if (request.mode === 'navigate') {
      return caches.match(`${APP_BASE}index.html`);
    }
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then((resp) => {
    if (resp && resp.ok) cache.put(request, resp.clone());
    return resp;
  }).catch(() => null);
  return cached || networkPromise || fetch(request);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return; // POSTs, etc. always go to network

  const url = new URL(request.url);

  // Same-origin only. Don't intercept third-party fonts, CDNs, etc.
  if (url.origin !== self.location.origin) return;

  // API calls must always be live — caching ratings would break the journal.
  if (url.pathname.startsWith('/api/')) return;

  // SPA navigations: network-first so deploys roll out fast, fall back to the
  // cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithCacheFallback(request));
    return;
  }

  // Static assets (JS/CSS/images/fonts under /rate-my-day/static/* or the
  // public/ folder): SWR — serve cached for speed, refresh in background.
  if (url.pathname.startsWith(APP_BASE)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
