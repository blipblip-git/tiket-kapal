// lib/publikFetch.ts
// Pembungkus fetch untuk API publik. Menambahkan header kanal resmi yang
// diwajibkan lib/publikGuard.ts, supaya halaman pembeli tetap bisa memanggil
// /api/publik/* tanpa membuka endpoint untuk website lain.

export function fetchPublik(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {})
  headers.set('x-lintasair-channel', 'web')
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(input, { ...init, headers })
}
