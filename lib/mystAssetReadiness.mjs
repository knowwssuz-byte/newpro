// Shared Telegram WebView-friendly loading strategy. No auth or private response caching.
export const FIRST_VIEW_ART = Object.freeze([
  '/onboarding/welcome-gift-v2.webp',
  '/feature/game-banners/rocket-v41.webp',
  '/feature/game-banners/pvp-v41.webp',
]);
export const INITIAL_ART_BUDGET_MS = 950;
const imagePromises = new Map();

export function isSlowConnection(connection) {
  return Boolean(connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || ''));
}

export function preloadDecodedImage(url, { priority = 'low', timeoutMs = 2500, makeImage } = {}) {
  if (!url || typeof url !== 'string') return Promise.resolve(false);
  if (imagePromises.has(url)) return imagePromises.get(url);

  const createImage = makeImage || (typeof window !== 'undefined' ? () => new window.Image() : null);
  if (!createImage) return Promise.resolve(false);
  const promise = new Promise((resolve) => {
    let done = false;
    let timer;
    let image;
    const finish = (ok) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      if (image) { image.onload = null; image.onerror = null; }
      resolve(ok);
    };
    try {
      image = createImage();
      image.decoding = 'async';
      image.loading = 'eager';
      image.fetchPriority = priority;
      image.onload = () => {
        if (typeof image.decode === 'function') {
          Promise.resolve().then(() => image.decode()).then(() => finish(true), () => finish(false));
        } else finish(true);
      };
      image.onerror = () => finish(false);
      timer = setTimeout(() => finish(false), Math.max(50, timeoutMs));
      image.src = url;
      // Complete images can be cached and have no future load event.
      if (image.complete && image.naturalWidth > 0) image.onload();
    } catch {
      finish(false);
    }
  });
  imagePromises.set(url, promise);
  promise.then((ok) => { if (!ok && imagePromises.get(url) === promise) imagePromises.delete(url); });
  return promise;
}

// A soft deadline protects UX if assets are broken or the network is offline.
// A timeout is NOT reported as an image being ready.
export async function prepareFirstView({ budgetMs = INITIAL_ART_BUDGET_MS, makeImage } = {}) {
  if (typeof window === 'undefined' && !makeImage) return { ready: false, timedOut: true };
  let deadline;
  // First-login welcome art has priority over below-the-fold game banners.
  const connection = typeof navigator !== 'undefined' ? navigator.connection : null;
  const immediate = isSlowConnection(connection) ? FIRST_VIEW_ART.slice(0,1) : FIRST_VIEW_ART;
  const assets = Promise.all(immediate.map((url, index) =>
    preloadDecodedImage(url, { priority: index===0?'high':'low', timeoutMs: 2600, makeImage })
  )).then((results) => ({ ready: results.every(Boolean), timedOut: false }));
  const cutoff = new Promise((resolve) => {
    deadline = setTimeout(() => resolve({ ready: false, timedOut: true }), budgetMs);
  });
  try { return await Promise.race([assets, cutoff]); }
  finally { clearTimeout(deadline); }
}

export function warmNearViewport(urls, connection, { makeImage } = {}) {
  const count = isSlowConnection(connection) ? 1 : 3;
  return [...new Set(urls.filter((url) => typeof url === 'string' && url))]
    .slice(0, count)
    .map((url) => preloadDecodedImage(url, { priority: 'low', timeoutMs: 2500, makeImage }));
}
