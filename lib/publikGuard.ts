// lib/publikGuard.ts
// Penjaga API publik: hanya boleh dipanggil dari aplikasi resmi (same-origin /
// domain yang diizinkan), bukan dari website lain atau curl sembarangan.
//
// Kenapa bukan API key? Endpoint ini dipakai browser pembeli, jadi kunci apa pun
// akan terlihat di DevTools. Yang efektif: cek Origin/Referer + header kanal
// khusus (permintaan lintas domain dari browser akan kena preflight CORS dan
// ditolak) + rate limit per IP.

import { NextResponse } from 'next/server'

const DOMAIN_BAWAAN = ['tiket-kapal.vercel.app']

function hostDari(url: string | null | undefined): string {
  if (!url) return ''
  try {
    return new URL(url).host.toLowerCase()
  } catch {
    return ''
  }
}

function tolak(pesan: string) {
  return NextResponse.json({ error: pesan }, { status: 403 })
}

/**
 * Mengembalikan NextResponse (403) kalau permintaan tidak sah,
 * atau null kalau boleh diproses.
 */
export function asalDiizinkan(request: Request): NextResponse | null {
  // Header khusus: tidak bisa dikirim website lain tanpa kena preflight CORS.
  if (request.headers.get('x-lintasair-channel') !== 'web') {
    return tolak('Akses ditolak. Permintaan harus berasal dari aplikasi resmi.')
  }

  const izin = new Set<string>(DOMAIN_BAWAAN)

  const dariEnv = (process.env.PUBLIK_ALLOWED_ORIGINS || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
  dariEnv.forEach((x) => izin.add(x))

  // Domain tempat aplikasi ini berjalan (Vercel preview / localhost dev).
  const hostSendiri = hostDari(request.url)
  if (hostSendiri) izin.add(hostSendiri)

  // Sebagian proxy (Vercel/nginx) membuat request.url berbeda dengan host asli.
  const hostHeader = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
  if (hostHeader) izin.add(hostHeader)

  const asal = hostDari(request.headers.get('origin')) || hostDari(request.headers.get('referer'))
  if (!asal) {
    return tolak('Akses ditolak. Permintaan harus berasal dari aplikasi resmi.')
  }
  if (!izin.has(asal)) {
    return tolak('Akses ditolak. Domain ini tidak diizinkan memakai API publik.')
  }

  return null
}
