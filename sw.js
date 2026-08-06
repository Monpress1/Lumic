
// Bump this on every deploy so old caches get cleared out.
const CACHE = "lumic-shell-v1";

// App shell: the files that must be available with zero network so a
// returning user can open the app offline. Add any other local static
// assets (icons, self-hosted fonts, etc.) here — do NOT add CDN URLs here;
// those are cached opportunistically by the fetch handler below instead.
const SHELL = [
  "./",
  "index.html",
  "lumic.html",
  "manifest.json",
  "logo.png",
  "home.jpg"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        SHELL.map((url) =>
          cache.add(url).catch((err) => console.warn("[sw] failed to precache", url, err))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  // Never intercept Supabase API/auth calls — those must hit the network
  // (or fail fast) so the app's own offline-handling logic can react,
  // rather than serving a stale cached API response.
  if (e.request.url.includes("supabase.co")) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const networkFetch = fetch(e.request)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(e.request, clone));
          }
          return res;
        })
        .catch(() => cached);

      // Cache-first for the app shell (instant load, updates in background).
      // Network-first-fallback-to-cache for everything else.
      return cached || networkFetch;
    })
  );
});
