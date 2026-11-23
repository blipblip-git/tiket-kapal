// lib/validasiNomorHpServer.ts
// Pemeriksaan nomor HP GLOBAL (semua penyewa) memakai service role.
// Dipakai API validasi form dan API tambah penyewa.

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalisasiNomorHp } from './nomorHp'

export type PemilikNomorHp = {
  id: string
  nama: string | null
  role: string | null
  nomor_hp: string | null
}

/**
 * Cari akun yang sudah memakai nomor HP yang sama (setelah dinormalisasi).
 * Mengembalikan null kalau nomor masih bebas.
 */
export async function cariPemilikNomorHp(
  admin: SupabaseClient,
  nomorHp: unknown,
  kecualiId?: string | null
): Promise<PemilikNomorHp | null> {
  const target = normalisasiNomorHp(nomorHp)
  if (!target) return null

  // profiles berisi semua penyewa + staf. Ambil bertahap supaya tidak terpotong
  // batas 1000 baris PostgREST.
  for (let dari = 0; dari < 20000; dari += 1000) {
    const { data, error } = await admin
      .from('profiles')
      .select('id, nama, role, nomor_hp')
      .not('nomor_hp', 'is', null)
      .range(dari, dari + 999)

    if (error) throw new Error('Gagal memeriksa nomor HP: ' + error.message)

    const baris = (data || []) as PemilikNomorHp[]
    for (const profil of baris) {
      if (kecualiId && profil.id === kecualiId) continue
      if (normalisasiNomorHp(profil.nomor_hp) === target) return profil
    }

    if (baris.length < 1000) break
  }

  return null
}

export function pesanNomorHpTerpakai(nomorHp: unknown, pemilik: PemilikNomorHp): string {
  const nama = (pemilik.nama || 'Tanpa nama').trim()
  const peran = pemilik.role || 'akun'
  return `Nomor HP ${String(nomorHp ?? '').trim()} sudah dipakai oleh akun "${nama}" (${peran}). Satu nomor HP hanya boleh untuk satu login. Silakan ganti nomor HP.`
}
