// Register/unregister the service worker.
//
// Only registers in production builds — running a SW in dev would break
// react-scripts hot reload and stale-cache assets that change every save.
//
// The worker lives at `${PUBLIC_URL}/sw.js`, which on the deployed site
// resolves to `/rate-my-day/sw.js`. Scope defaults to the path the SW
// is served from, which matches the SPA's basename.

export function register() {
  if (process.env.NODE_ENV !== 'production') return;
  if (!('serviceWorker' in navigator)) return;

  // Wait for window load to avoid contending with first-paint resources.
  window.addEventListener('load', () => {
    const swUrl = `${process.env.PUBLIC_URL || ''}/sw.js`;
    navigator.serviceWorker.register(swUrl)
      .then((registration) => {
        // eslint-disable-next-line no-console
        console.log('[SW] registered with scope', registration.scope);
      })
      .catch((err) => {
        console.warn('[SW] registration failed', err);
      });
  });
}

// Useful for emergency rollbacks — call from the JS console to nuke the SW
// without having to ship code.
export function unregister() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready
    .then((registration) => registration.unregister())
    .catch((err) => console.warn('[SW] unregister failed', err));
}
