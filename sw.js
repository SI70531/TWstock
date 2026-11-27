/* TWstock service worker: only the page's own files are kept, so the app can open without a network.
   Always network first (an update is never held back by an old copy); market data is never stored here. */
const CACHE = "twstock-shell";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok) { const c = await caches.open(CACHE); c.put(req, res.clone()); }
      return res;
    } catch (err) {
      const hit = (await caches.match(req)) || (await caches.match(req, { ignoreSearch: true })) || (req.mode === "navigate" ? await caches.match("./index.html", { ignoreSearch: true }) : null);
      if (hit) return hit;
      return new Response("", { status: 504, statusText: "offline" });
    }
  })());
});
