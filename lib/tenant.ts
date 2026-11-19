// lib/tenant.ts
// Helper pemisah data antar penyewa (multi-tenant).
//
// Catatan penting:
// - `jadwal.operator_id` baru diisi belakangan, jadi jadwal lama bisa NULL.
// - Untuk data lama, pemilik ditentukan dari `kapal.operator_id` (armada kapal
//   sudah punya operator_id sejak awal multi-tenant).
// - Jangan pernah menganggap jadwal tanpa pemilik sebagai milik semua orang:
//   itulah yang membuat laporan PT Andalas bocor ke PT Limex.
import { supabase, type Profile } from './supabase'

/** ID operator (admin utama) yang mewakili profil yang sedang login. */
export function idOperator(profile: Profile | null | undefined): string | null {
  if (!profile) return null
  if (profile.role === 'superadmin') return null // superadmin melihat semua
  return profile.operator_id || profile.id
}

/** Tipe minimal data jadwal yang dibutuhkan untuk menentukan pemilik. */
export type JadwalPemilik = {
  operator_id?: string | null
  kapal_id?: string | null
} | null | undefined

/** Peta kapal_id -> operator_id (pemilik kapal). */
export async function ambilOperatorKapal(
  kapalIds: (string | null | undefined)[]
): Promise<Map<string, string | null>> {
  const peta = new Map<string, string | null>()
  const ids = [...new Set(kapalIds.filter(Boolean) as string[])]
  if (ids.length === 0) return peta

  const { data } = await supabase.from('kapal').select('id, operator_id').in('id', ids)
  data?.forEach((k: any) => peta.set(k.id, k.operator_id || null))
  return peta
}

/**
 * Pemilik sebuah jadwal.
 * Utamakan operator_id jadwal; kalau NULL (data lama), pakai pemilik kapal.
 */
export function pemilikJadwal(
  jadwal: JadwalPemilik,
  petaOperatorKapal?: Map<string, string | null>
): string | null {
  if (!jadwal) return null
  if (jadwal.operator_id) return jadwal.operator_id
  if (jadwal.kapal_id && petaOperatorKapal) return petaOperatorKapal.get(jadwal.kapal_id) || null
  return null
}

/**
 * Cek apakah jadwal milik operator yang sedang login.
 * `operatorId` NULL berarti superadmin (boleh lihat semua).
 */
export function cocokOperator(
  jadwal: JadwalPemilik,
  operatorId: string | null | undefined,
  petaOperatorKapal?: Map<string, string | null>
): boolean {
  if (!operatorId) return true
  return pemilikJadwal(jadwal, petaOperatorKapal) === operatorId
}
