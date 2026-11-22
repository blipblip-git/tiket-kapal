'use client'

// lib/rute.ts
// SUMBER TUNGGAL daftar rute milik penyewa (pemilik kapal).
//
// Dipakai oleh:
//   - /laporan-penjualan-admin  (kartu daerah + kartu manifest)
//   - /superadmin/pusat-kontrol/admin/manifest (daftar rute + pemilih rute)
//
// Sumber data (urutan = urutan tampil):
//   1. master_rute         -> rute yang didaftarkan (Superadmin / pemilik)
//   2. template_jadwal     -> rute yang diinput pemilik di Manajemen Jadwal
//   3. jadwal              -> rute yang sudah pernah beroperasi
//
// ATURAN: rute dibaca SEJAK DIDAFTARKAN, tidak menunggu ada penjualan.
// Baris ber-operator_id NULL = rute umum / data lama, tetap dibaca lalu
// disaring kepemilikannya lewat pemilik kapal (lib/tenant.ts).
import { supabase, type Profile } from './supabase'
import { idOperator, ambilOperatorKapal, cocokOperator } from './tenant'
import { urutkanLokasi } from './lokasi'

export type RuteKapal = { rute_asal: string; rute_tujuan: string }

/** Kunci unik 1 arah rute. */
export function kunciRute(r: RuteKapal): string {
  return `${r.rute_asal}|${r.rute_tujuan}`
}

/** Ujung rute (asal + tujuan) yang unik — dasar kartu "Laporan <daerah>". */
export function ujungRute(daftar: RuteKapal[]): string[] {
  return Array.from(
    new Set(
      daftar
        .flatMap((r) => [r.rute_asal, r.rute_tujuan])
        .map((s) => String(s || '').trim())
        .filter(Boolean)
    )
  )
}

/** Urutan baku: Tarakan, Tanjung Selor, lalu alfabetis. */
export function urutkanRute(daftar: RuteKapal[]): RuteKapal[] {
  const posisiAsal = urutkanLokasi(Array.from(new Set(daftar.map((r) => r.rute_asal))))
  const posisi = (nama: string) => {
    const idx = posisiAsal.indexOf(nama)
    return idx === -1 ? posisiAsal.length : idx
  }
  return [...daftar].sort(
    (a, b) => posisi(a.rute_asal) - posisi(b.rute_asal) || a.rute_tujuan.localeCompare(b.rute_tujuan)
  )
}

/** Ambil semua rute milik penyewa yang sedang login (superadmin = semua). */
export async function muatRutePemilik(profile: Profile | null | undefined): Promise<RuteKapal[]> {
  if (!profile) return []
  const operatorId = idOperator(profile)
  const kumpulan: RuteKapal[] = []

  // 1. Master Rute
  try {
    let q = supabase
      .from('master_rute')
      .select('rute_asal, rute_tujuan, operator_id')
      .order('created_at', { ascending: true })
    if (operatorId) q = q.or(`operator_id.eq.${operatorId},operator_id.is.null`)
    const { data } = await q
    ;(data || []).forEach((r: any) => {
      if (r.rute_asal && r.rute_tujuan) {
        kumpulan.push({ rute_asal: String(r.rute_asal), rute_tujuan: String(r.rute_tujuan) })
      }
    })
  } catch {
    // diamkan: lanjut ke sumber berikutnya
  }

  // 2. Template Manajemen Jadwal
  try {
    let q = supabase.from('template_jadwal').select('rute_asal, rute_tujuan, kapal_id, operator_id')
    if (operatorId) q = q.or(`operator_id.eq.${operatorId},operator_id.is.null`)
    const { data } = await q
    const petaKapal = await ambilOperatorKapal((data || []).map((t: any) => t.kapal_id))
    ;(data || []).forEach((t: any) => {
      if (!t.rute_asal || !t.rute_tujuan) return
      if (!cocokOperator(t, operatorId, petaKapal)) return
      kumpulan.push({ rute_asal: String(t.rute_asal), rute_tujuan: String(t.rute_tujuan) })
    })
  } catch {
    // diamkan
  }

  // 3. Jadwal yang sudah ada
  try {
    const { data } = await supabase
      .from('jadwal')
      .select('rute_asal, rute_tujuan, kapal_id, operator_id')
      .limit(1000)
    const petaKapal = await ambilOperatorKapal((data || []).map((j: any) => j.kapal_id))
    ;(data || []).forEach((j: any) => {
      if (!j.rute_asal || !j.rute_tujuan) return
      if (!cocokOperator(j, operatorId, petaKapal)) return
      kumpulan.push({ rute_asal: String(j.rute_asal), rute_tujuan: String(j.rute_tujuan) })
    })
  } catch {
    // diamkan
  }

  return Array.from(new Map(kumpulan.map((r) => [kunciRute(r), r])).values())
}
