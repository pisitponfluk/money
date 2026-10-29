/* Service worker: keeps the app itself on the phone so it opens instantly and offline.
   Money data never goes through here — the page talks to Apps Script directly and keeps
   its own copy and unsent queue. Bump VERSION whenever any file below changes. */
const VERSION = "v2.0.3";
const SHELL = ["./", "index.html", "manifest.webmanifest",
  "icon-192.png", "icon-512.png", "maskable-512.png", "apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open("shell-" + VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== "shell-" + VERSION && k !== "fonts").map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;                      // API calls (POST) go straight to the network
  if (url.hostname.endsWith("google.com") || url.hostname.endsWith("googleusercontent.com")) return;

  // Google Fonts: serve the saved copy, refresh it in the background
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open("fonts").then(c => c.match(req).then(hit => {
      const net = fetch(req).then(r => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })));
    return;
  }

  if (url.origin !== location.origin) return;
  // the page: network first (so updates arrive), saved copy when offline
  if (req.mode === "navigate") {
    e.respondWith(fetch(req, { cache: "no-store" }).then(r => {
      const copy = r.clone(); caches.open("shell-" + VERSION).then(c => c.put("index.html", copy)); return r;
    }).catch(() => caches.match("index.html").then(r => r || caches.match("./"))));
    return;
  }
  // icons, manifest: saved copy first
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
