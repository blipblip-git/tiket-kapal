// lib/kolektor.ts
// Penanda akun KOLEKTOR (penagih uang cash di satu lokasi).
//
// Kenapa ada 2 bentuk?
// - Bentuk utama: role = 'kolektor'.
// - Bentuk cadangan: role = 'petugas_loket' + unit = 'Kolektor', dipakai kalau
//   check-constraint database (profiles_role_check) belum mengizinkan role baru.
// Semua kode WAJIB memakai adalahKolektor() supaya dua bentuk itu setara.

export const ROLE_KOLEKTOR = 'kolektor'
export const UNIT_KOLEKTOR = 'Kolektor'

export const DAFTAR_LOKASI = ['Tarakan', 'Tanjung Selor', 'Malinau', 'Nunukan', 'KTT', 'Bunyu']

type PenandaKolektor = { role?: string | null; unit?: string | null } | null | undefined

export function adalahKolektor(profil: PenandaKolektor): boolean {
  if (!profil) return false
  if (String(profil.role || '').trim().toLowerCase() === ROLE_KOLEKTOR) return true
  return String(profil.unit || '').trim().toLowerCase() === UNIT_KOLEKTOR.toLowerCase()
}

/** Role yang dikirim ke browser/sesi: akun cadangan tetap tampil sebagai 'kolektor'. */
export function roleEfektif(profil: PenandaKolektor): string {
  const role = String(profil?.role || '').trim().toLowerCase()
  return adalahKolektor(profil) ? ROLE_KOLEKTOR : role
}
