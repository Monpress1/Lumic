
// Lumic — offline app-shell service worker.
// Deploy this file at the SITE ROOT (same place as index.html), so it's
// reachable at https://thelumic.vercel.app/sw.js — the app already calls
// navigator.serviceWorker.register("sw.js") on load.

const CACHE_NAME = "lumic-shell-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.json", "/logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(APP_SHELL).catch(() => {
        // Some of these may not exist (e.g. no manifest.json) — don't let
        // a single 404 fail the whole install.
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Never intercept Supabase/API calls or streaming audio — those must
  // always hit the network live.
  const url = new URL(request.url);
  if (url.hostname.includes("supabase.co") || url.pathname.match(/\.(mp3|m4a|aac|wav|flac)$/i)) {
    return;
  }

  // Page loads: try the network first (so you always get the latest
  // deploy), fall back to the cached shell so the app still opens offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match("/index.html").then((r) => r || caches.match("/")))
    );
    return;
  }

  // Everything else (CSS/JS/CDN libraries/icons): serve from cache
  // instantly if present, and refresh the cache in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
