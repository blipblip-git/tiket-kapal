// Service worker LintasAir.
// Tugasnya cuma dua:
// 1. Memenuhi syarat "installable" PWA di Chrome/Android + Safari iOS, supaya
//    aplikasi bisa dipasang dan dibuka tanpa address bar (standalone).
// 2. Menyimpan file ikon di cache agar splash/ikon muncul instan.
//
// PENTING: halaman HTML, data Supabase, dan API TIDAK di-cache. Semua permintaan
// selain ikon dibiarkan lewat ke jaringan apa adanya, jadi tidak ada risiko
// penumpang melihat jadwal/harga lama gara-gara cache.

const CACHE = 'lintasair-v2'

const ASET_IKON = [
  '/images/icon-192.png',
  '/images/icon-512.png',
  '/images/icon-maskable-192.png',
  '/images/icon-maskable-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // addAll gagal total kalau satu file 404, jadi ditambahkan satu per satu.
      .then((cache) => Promise.all(ASET_IKON.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((kunci) => Promise.all(kunci.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const permintaan = event.request

  // Hanya GET, hanya domain sendiri, dan hanya file ikon yang disentuh.
  if (permintaan.method !== 'GET') return

  const url = new URL(permintaan.url)
  if (url.origin !== self.location.origin) return
  if (!url.pathname.startsWith('/images/icon-')) return

  event.respondWith(
    caches.match(permintaan).then(
      (tersimpan) =>
        tersimpan ||
        fetch(permintaan).then((respon) => {
          if (respon.ok) {
            const salinan = respon.clone()
            caches.open(CACHE).then((cache) => cache.put(permintaan, salinan))
          }
          return respon
        })
    )
  )
})
