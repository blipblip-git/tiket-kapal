// lib/sessionToken.ts
// Token sesi ringan untuk API internal (dipakai akun Kolektor).
// Ditandatangani HMAC-SHA256 dengan rahasia server, jadi tidak perlu disimpan
// di database dan tidak bisa dipalsukan dari browser.
//
// HANYA UNTUK SERVER. Jangan di-import dari komponen client.

import crypto from 'crypto'

const UMUR_SESI_MS = 12 * 60 * 60 * 1000 // 12 jam

function rahasia(): string {
  return process.env.SESI_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

/** Buat token untuk 1 profil (dipanggil setelah login berhasil). */
export function buatTokenSesi(id: string): string | null {
  const secret = rahasia()
  if (!secret || !id) return null

  const payload = Buffer.from(
    JSON.stringify({ sub: id, exp: Date.now() + UMUR_SESI_MS })
  ).toString('base64url')
  const tanda = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${tanda}`
}

/** Verifikasi token. Hasil null = tidak valid / kedaluwarsa / rahasia belum diset. */
export function verifikasiTokenSesi(token: string): { sub: string } | null {
  const secret = rahasia()
  if (!secret || !token) return null

  const [payload, tanda] = token.split('.')
  if (!payload || !tanda) return null

  const harapan = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  const a = Buffer.from(tanda)
  const b = Buffer.from(harapan)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!data?.sub || typeof data.exp !== 'number' || data.exp < Date.now()) return null
    return { sub: String(data.sub) }
  } catch {
    return null
  }
}
