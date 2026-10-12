const CACHE_NAME = "pa-gerrys-mart-pos-v3";
const APP_SHELL = ["/", "/manifest.webmanifest", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    // A failed optional asset must not prevent the new worker from installing.
    await Promise.allSettled(APP_SHELL.map(async (path) => {
      const response = await fetch(path, { cache: "reload" });
      if (response.ok) await (await caches.open(CACHE_NAME)).put(path, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("pa-gerrys-mart-pos-") && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") event.waitUntil(self.skipWaiting());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // Never intercept database/auth traffic or configuration requests.
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/.netlify/")) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok && response.type !== "opaque") {
        const copy = response.clone();
        event.waitUntil((async () => {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request.mode === "navigate" ? "/" : event.request, copy);
        })().catch(() => undefined));
      }
      return response;
    } catch {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request);
      if (cached) return cached;
      if (event.request.mode === "navigate") {
        const shell = await cache.match("/");
        if (shell) return shell;
      }
      return new Response("Offline: resource unavailable", { status: 503, headers: { "Content-Type": "text/plain" } });
    }
  })());
});