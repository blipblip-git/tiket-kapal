// lib/bersihJadwal.ts
// Pembersihan jadwal turunan saat kapal / template jadwal dihapus atau dinonaktifkan.
// Alasan: jadwal yang sudah digenerate untuk tanggal-tanggal mendatang TIDAK ikut
// hilang saat kapal/rutenya dihapus, sehingga kapal yang "sudah dihapus" masih
// muncul di pencarian tiket online. Semua penghapusan jadwal WAJIB lewat sini.

import type { SupabaseClient } from '@supabase/supabase-js'

export type TargetJadwal = {
  kapal_id: string
  rute_asal?: string
  rute_tujuan?: string
  jam_berangkat?: string
}

/** Tanggal hari ini menurut WITA (UTC+8), format YYYY-MM-DD. */
const hariIniWITA = () => new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().split('T')[0]

/** Ambil id jadwal mendatang yang cocok dengan target (kapal dan/atau rute & jam). */
async function ambilJadwalMendatang(sb: SupabaseClient, t: TargetJadwal): Promise<string[]> {
  let q = sb
    .from('jadwal')
    .select('id')
    .eq('kapal_id', t.kapal_id)
    .gte('tanggal', hariIniWITA())

  if (t.rute_asal) q = q.eq('rute_asal', t.rute_asal)
  if (t.rute_tujuan) q = q.eq('rute_tujuan', t.rute_tujuan)
  if (t.jam_berangkat) q = q.eq('jam_berangkat', t.jam_berangkat)

  const { data } = await q
  return (data || []).map((j: any) => String(j.id))
}

/** Jadwal yang sudah punya pesanan tidak boleh dihapus (tiket penumpang harus tetap sah). */
async function pisahkanTerjual(sb: SupabaseClient, ids: string[]): Promise<{ hapus: string[]; nonaktif: string[] }> {
  if (ids.length === 0) return { hapus: [], nonaktif: [] }
  const { data } = await sb.from('pesanan').select('jadwal_id').in('jadwal_id', ids)
  const terjual = new Set((data || []).map((p: any) => String(p.jadwal_id)))
  return {
    hapus: ids.filter((id) => !terjual.has(id)),
    nonaktif: ids.filter((id) => terjual.has(id)),
  }
}

/**
 * Bersihkan jadwal mendatang milik kapal/rute yang dihapus:
 * - belum ada penjualan → kursinya + jadwalnya DIHAPUS
 * - sudah ada penjualan → status jadwal jadi 'nonaktif' (hilang dari pencarian,
 *   tiket lama tetap valid)
 */
export async function bersihkanJadwalTurunan(
  sb: SupabaseClient,
  t: TargetJadwal
): Promise<{ dihapus: number; dinonaktifkan: number }> {
  const ids = await ambilJadwalMendatang(sb, t)
  const { hapus, nonaktif } = await pisahkanTerjual(sb, ids)

  if (hapus.length > 0) {
    // Kursi dibersihkan dulu supaya tidak jadi data yatim.
    await sb.from('kursi').delete().in('jadwal_id', hapus)
    await sb.from('jadwal').delete().in('id', hapus)
  }
  if (nonaktif.length > 0) {
    await sb.from('jadwal').update({ status: 'nonaktif' }).in('id', nonaktif)
  }

  return { dihapus: hapus.length, dinonaktifkan: nonaktif.length }
}

/**
 * Sinkron status jadwal mendatang saat template diaktifkan/dinonaktifkan.
 * Tanpa ini, rute yang dimatikan (bukan dihapus) tetap bisa dijual dari jadwal lama.
 */
export async function setStatusJadwalTurunan(
  sb: SupabaseClient,
  t: TargetJadwal,
  aktif: boolean
): Promise<number> {
  const ids = await ambilJadwalMendatang(sb, t)
  const { hapus, nonaktif } = await pisahkanTerjual(sb, ids)
  // Saat diaktifkan lagi, jadwal yang belum terjual (termasuk yang tadi nonaktif) ikut hidup.
  const target = [...hapus, ...nonaktif]
  if (target.length === 0) return 0
  await sb.from('jadwal').update({ status: aktif ? 'aktif' : 'nonaktif' }).in('id', target)
  return target.length
}
