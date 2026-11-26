// lib/password.ts
// Hash password di sisi browser memakai Web Crypto (PBKDF2-SHA256).
// Format hash: pbkdf2$<iterasi>$<salt base64>$<hash base64>
//
// KENAPA: password TIDAK BOLEH disimpan sebagai teks biasa di tabel profiles.
// Kalau database/anon key bocor, yang terbaca hanya hash (tidak bisa dipakai login).

import { supabase } from './supabase'

export const PASSWORD_HASH_ITERATIONS = 120000
const PASSWORD_HASH_PREFIX = 'pbkdf2'

function bytesKeBase64(bytes: Uint8Array): string {
  let biner = ''
  bytes.forEach((b) => { biner += String.fromCharCode(b) })
  return btoa(biner)
}

export async function hashPassword(password: string): Promise<string> {
  if (!password) throw new Error('Password tidak boleh kosong')

  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Browser tidak mendukung hash password. Buka aplikasi lewat HTTPS atau localhost.')
  }

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )

  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PASSWORD_HASH_ITERATIONS, hash: 'SHA-256' },
    key,
    256
  )

  return `${PASSWORD_HASH_PREFIX}$${PASSWORD_HASH_ITERATIONS}$${bytesKeBase64(salt)}$${bytesKeBase64(new Uint8Array(bits))}`
}

// Cek sekali apakah kolom password_hash sudah ada di database.
// Kalau belum (SQL migrasi belum dijalankan), kode tetap jalan dengan cara lama
// supaya aplikasi tidak mati — tapi WAJIB jalankan supabase/security-hardening.sql.
let probeDukungan: Promise<boolean> | null = null

export function dukunganPasswordHash(): Promise<boolean> {
  if (!probeDukungan) {
    probeDukungan = (async () => {
      try {
        const { error } = await supabase.from('profiles').select('password_hash').limit(1)
        if (error) {
          console.warn('Kolom password_hash belum ada. Jalankan supabase/security-hardening.sql:', error.message)
          return false
        }
        return true
      } catch {
        return false
      }
    })()
  }
  return probeDukungan
}

// Menghasilkan potongan payload insert/update untuk kolom password.
export async function fieldPasswordBaru(password: string): Promise<Record<string, string | null>> {
  if (await dukunganPasswordHash()) {
    return { password_hash: await hashPassword(password) }
  }
  return { password_plain: password }
}

// Verifikasi password terhadap hash yang tersimpan.
// Dipakai halaman Pusat Kontrol → Akun Syahbandar untuk memastikan password
// antar akun Syahbandar tidak kembar: login Syahbandar HANYA memakai password,
// jadi password itulah identitas akunnya.
export async function cocokkanPassword(
  password: string,
  hash: string | null | undefined
): Promise<boolean> {
  if (!password || !hash) return false

  const bagian = hash.split('$')
  if (bagian.length !== 4 || bagian[0] !== PASSWORD_HASH_PREFIX) return false

  const iterasi = Number(bagian[1])
  if (!Number.isFinite(iterasi) || iterasi < 1000) return false
  if (typeof crypto === 'undefined' || !crypto.subtle) return false

  try {
    const salt = Uint8Array.from(atob(bagian[2]), (c) => c.charCodeAt(0))
    const harapan = Uint8Array.from(atob(bagian[3]), (c) => c.charCodeAt(0))
    if (harapan.length === 0) return false

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    )

    const bits = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: iterasi, hash: 'SHA-256' },
        key,
        harapan.length * 8
      )
    )

    if (bits.length !== harapan.length) return false

    let beda = 0
    for (let i = 0; i < bits.length; i++) beda |= bits[i] ^ harapan[i]
    return beda === 0
  } catch {
    return false
  }
}

export const PASSWORD_MASK = '••••••••'
