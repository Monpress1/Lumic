// ============================================================================
// Lumic service worker
// ============================================================================
// Why this file exists: index.html has always called
// navigator.serviceWorker.register('sw.js'), but no sw.js was ever actually
// provided — so that call silently failed, and NONE of the app's CDN
// dependencies (Tailwind, the Supabase SDK, Font Awesome, Google Fonts) were
// ever cached for offline use. Opening the app with no network meant those
// CDN scripts/styles simply never loaded: Tailwind not loading doesn't mean
// "no styling", it means every .text-white / .flex / .rounded-3xl / .p-4
// class in the whole app silently does nothing, which is exactly the
// collapsed, unreadable black-on-black layout you saw.
//
// This service worker caches the app shell up front, then opportunistically
// caches every other GET request (including the CDN scripts/fonts) the first
// time it succeeds — so after one normal online visit, reopening fully
// offline serves everything from cache instead of failing silently.
//
// Bump CACHE_VERSION any time index.html changes and you need every open
// tab/device to pick up the new file instead of an old cached copy.
// ============================================================================

const CACHE_VERSION = "lumic-shell-v1";

// Same-origin files only here — cross-origin CDN files get cached lazily by
// the fetch handler below the first time they're actually requested, since
// their exact URLs (especially Google Fonts' hashed font file URLs) aren't
// something this file can safely hardcode in advance.
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            // A missing/failed individual URL (e.g. no manifest.json on this
            // deployment) should never block the rest of the shell from
            // caching successfully.
            console.warn("[sw] precache skipped:", url, err && err.message);
          })
        )
      )
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Live Supabase calls (auth, database, storage, realtime) must be allowed
  // to genuinely fail when offline rather than silently serving stale data —
  // the app's own code already handles those failures gracefully.
  if (req.url.includes(".supabase.co")) return;

  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(req);

      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      if (cached) {
        // Stale-while-revalidate: serve what's cached immediately (this is
        // what makes offline instant instead of hanging on a dead network
        // request), and quietly refresh the cache in the background for
        // next time in case the file has since changed.
        event.waitUntil(networkFetch);
        return cached;
      }

      const fresh = await networkFetch;
      if (fresh) return fresh;

      // Nothing cached and no network. For a full page navigation, fall
      // back to the cached app shell so the UI still loads instead of the
      // browser's own "no internet" error page.
      if (req.mode === "navigate") {
        const shell = await cache.match("./index.html");
        if (shell) return shell;
      }
      return new Response("Offline and not yet cached.", { status: 503, statusText: "Offline" });
    })
  );
});

