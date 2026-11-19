// lib/passwordServer.ts
// Verifikasi & hash password di server (Node crypto). JANGAN di-import dari komponen client.

import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto'

export const PASSWORD_HASH_ITERATIONS = 120000
const PASSWORD_HASH_PREFIX = 'pbkdf2'

export function hashPasswordServer(password: string): string {
  const salt = randomBytes(16)
  const hash = pbkdf2Sync(password, salt, PASSWORD_HASH_ITERATIONS, 32, 'sha256')
  return `${PASSWORD_HASH_PREFIX}$${PASSWORD_HASH_ITERATIONS}$${salt.toString('base64')}$${hash.toString('base64')}`
}

/**
 * Verifikasi password terhadap hash pbkdf2.
 * Kalau `tersimpan` bukan hash (akun lama yang masih password_plain), dibandingkan
 * sebagai teks biasa supaya akun lama tetap bisa login lalu otomatis dimigrasi.
 */
export function verifyPassword(password: string, tersimpan?: string | null): boolean {
  if (!tersimpan) return false

  if (!tersimpan.startsWith(`${PASSWORD_HASH_PREFIX}$`)) {
    return tersimpan === password
  }

  const bagian = tersimpan.split('$')
  if (bagian.length !== 4) return false

  const iterasi = Number(bagian[1])
  if (!Number.isFinite(iterasi) || iterasi < 1000) return false

  try {
    const salt = Buffer.from(bagian[2], 'base64')
    const harapan = Buffer.from(bagian[3], 'base64')
    const hasil = pbkdf2Sync(password, salt, iterasi, harapan.length, 'sha256')
    return harapan.length === hasil.length && timingSafeEqual(harapan, hasil)
  } catch {
    return false
  }
}

// Deteksi singkat: error dari PostgREST kalau kolom belum ada.
export function kolomPasswordHashBelumAda(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '42703' || /password_hash/i.test(error.message || '')
}
