// Offline cache for the chair workout app. Bump VERSION on every release.
const VERSION="chair-fit-v1";
const CORE=["./", "index.html", "manifest.webmanifest", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "img/armcircles.jpg", "img/chestopen.jpg", "img/crosscrunch.jpg", "img/curl.jpg", "img/diagonal.jpg", "img/fly.jpg", "img/foottaps.jpg", "img/frogcrunch.jpg", "img/lateral.jpg", "img/legkick.jpg", "img/march.jpg", "img/opentuck.jpg", "img/press.jpg", "img/punch.jpg", "img/pushchair.jpg", "img/row.jpg", "img/seatjacks.jpg", "img/shrug.jpg", "img/sidecrunch.jpg", "img/sidestretch.jpg", "img/sitstand.jpg", "img/triceps.jpg", "img/twist.jpg", "img/underclap.jpg", "img/windmill.jpg", "img/ytw.jpg"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{
  const req=e.request;if(req.method!=="GET")return;
  const url=new URL(req.url);
  // Page itself: network first so updates arrive, cache as fallback offline.
  if(req.mode==="navigate"){e.respondWith(fetch(req).then(r=>{const cp=r.clone();caches.open(VERSION).then(c=>c.put("index.html",cp));return r;}).catch(()=>caches.match("index.html")));return;}
  // Same-origin assets and Google Fonts: cache first, then network (and store).
  if(url.origin===location.origin||/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)){
    e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>{if(r.ok||r.type==="opaque"){const cp=r.clone();caches.open(VERSION).then(c=>c.put(req,cp));}return r;})));
  }
});
