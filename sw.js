const CACHE_NAME = "pf-dashboard-v2";
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./src/main.js",
  "./src/api.js",
  "./src/storage.js",
  "./src/state.js",
  "./src/format.js",
  "./src/config.js",
  "./src/ui/list.js",
  "./src/ui/chart.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if(request.method !== "GET") return;

  const url = new URL(request.url);
  const isAppsScript = url.hostname === "script.google.com"
    || url.hostname === "script.googleusercontent.com"
    || url.pathname.includes("/exec");

  if(isAppsScript){
    event.respondWith(fetch(request));
    return;
  }
  if(url.origin !== self.location.origin){
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if(cached) return cached;
      return fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});
