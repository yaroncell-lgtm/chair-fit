// Offline cache for the chair workout app. Bump VERSION on every release.
// App files: network first (updates arrive at once), cache as offline fallback.
// ChairSensei posters: cache first. Exercise video clips are never cached (range requests, size).
const VERSION = "chair-fit-v5";
const CORE = ["./", "index.html", "app.css?v=5", "ex.js?v=5", "app.js?v=5", "manifest.webmanifest",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const put = (req, r) => { if (r && (r.ok || r.type === "opaque")) { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); } return r; };
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);
  if (req.mode === "navigate") { e.respondWith(fetch(req).then(r => put("index.html", r)).catch(() => caches.match("index.html"))); return; }
  if (url.origin === location.origin) { e.respondWith(fetch(req).then(r => put(req, r)).catch(() => caches.match(req))); return; }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname) || /\/assets\/ex\/poster\//.test(url.pathname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => put(req, r))));
  }
});
