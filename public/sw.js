// Service worker KasirKu: aset statis cache-first, navigasi network-first
// dengan fallback halaman /pos. /api/* TIDAK PERNAH di-cache (data uang harus segar).
const CACHE = "kasirku-v1";
const ASET_AWAL = ["/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASET_AWAL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // biarkan browser ke jaringan langsung

  if (url.pathname.startsWith("/_next/static/") || ASET_AWAL.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const salinan = res.clone();
              caches.open(CACHE).then((c) => c.put(req, salinan));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Simpan hanya halaman POS yang benar-benar termuat (bukan redirect ke /login).
          if (res.ok && !res.redirected && url.pathname === "/pos") {
            const salinan = res.clone();
            caches.open(CACHE).then((c) => c.put("/pos", salinan));
          }
          return res;
        })
        .catch(() =>
          caches.match("/pos").then(
            (hit) => hit || new Response("Offline: buka /pos sekali saat online agar tersedia offline.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            }),
          ),
        ),
    );
  }
});
