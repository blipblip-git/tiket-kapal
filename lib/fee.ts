// lib/fee.ts
// Helper Laporan Fee (fee agen per tiket + fee platform).
//
// Aturan:
// - Fee AGEN diisi Admin Utama saat mendaftarkan agen (profiles.fee). Fee itu
//   mengurangi uang penjualan pemilik, dihitung PER TIKET DEWASA.
// - Fee PLATFORM hanya 1 nilai global (tabel pengaturan_platform) dan diisi
//   Superadmin sekali; berlaku untuk SEMUA penjualan offline.
// - Nilai fee "dibekukan" saat transaksi (snapshot) di kolom
//   pesanan.fee_agen & pesanan.fee_platform. Kalau kolom/belum ada isinya
//   (transaksi lama), laporan memakai fee yang berlaku sekarang.
// - Semua probe kolom dilakukan sekali per muat halaman, jadi aplikasi tetap
//   jalan walau SQL migrasi fee belum dijalankan.
import { supabase } from './supabase'

export const KANAL_OFFLINE = ['agen', 'loket', 'mobile', 'keberangkatan', 'petugas'] as const

// ==================== PROBE KOLOM (aman sebelum migrasi) ====================
let cekKolomProfil: boolean | null = null
let cekKolomPesanan: boolean | null = null
let cekTabelPlatform: boolean | null = null

/** Apakah kolom profiles.fee sudah ada? */
export async function feeProfilAda(): Promise<boolean> {
  if (cekKolomProfil !== null) return cekKolomProfil
  const { error } = await supabase.from('profiles').select('fee').limit(1)
  cekKolomProfil = !error
  return cekKolomProfil
}

/** Apakah kolom snapshot pesanan.fee_agen & fee_platform sudah ada? */
export async function feePesananAda(): Promise<boolean> {
  if (cekKolomPesanan !== null) return cekKolomPesanan
  const { error } = await supabase.from('pesanan').select('fee_agen, fee_platform').limit(1)
  cekKolomPesanan = !error
  return cekKolomPesanan
}

/** Apakah tabel pengaturan_platform sudah ada? */
export async function tabelPlatformAda(): Promise<boolean> {
  if (cekTabelPlatform !== null) return cekTabelPlatform
  const { error } = await supabase.from('pengaturan_platform').select('fee_platform').limit(1)
  cekTabelPlatform = !error
  return cekTabelPlatform
}

// ==================== KODE DAERAH (otomatis dari lokasi) ====================
// Singkatan resmi diambil dari tabel master_kota (Kamus Kota). Kalau kotanya
// belum terdaftar, dibentuk otomatis dari huruf konsonan nama lokasi
// (Tarakan -> TRK, KTT -> KTT).
const KODE_LOKASI_KHUSUS: { [lokasi: string]: string } = {
  tarakan: 'TRK',
  'tanjung selor': 'TJS'
}

export function kodeDaerah(lokasi: string): string {
  const kunci = String(lokasi || '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (!kunci) return '-'
  if (KODE_LOKASI_KHUSUS[kunci]) return KODE_LOKASI_KHUSUS[kunci]

  const huruf = kunci.toUpperCase().replace(/[^A-Z]/g, '')
  if (!huruf) return '-'
  const konsonan = huruf.replace(/[AEIOU]/g, '')
  const dasar = konsonan.length >= 2 ? konsonan : huruf
  return dasar.slice(0, 3).padEnd(Math.min(3, dasar.length), dasar.slice(-1) || 'X')
}

/** Peta singkatan dari Kamus Kota (master_kota): nama kota -> singkatan. */
export async function petaKodeKota(): Promise<{ [lokasi: string]: string }> {
  const peta: { [lokasi: string]: string } = {}
  const { data } = await supabase.from('master_kota').select('nama_kota, singkatan')
  ;(data || []).forEach((k: any) => {
    const nama = String(k.nama_kota || '').trim().toLowerCase()
    const singkatan = String(k.singkatan || '').trim().toUpperCase()
    if (nama && singkatan) peta[nama] = singkatan
  })
  return peta
}

export function kodeUntukLokasi(lokasi: string, peta: { [lokasi: string]: string }): string {
  const kunci = String(lokasi || '').trim().toLowerCase()
  return peta[kunci] || kodeDaerah(lokasi)
}

// ==================== FEE PLATFORM (nilai global) ====================
export async function ambilFeePlatform(): Promise<number> {
  if (!(await tabelPlatformAda())) return 0
  const { data } = await supabase
    .from('pengaturan_platform')
    .select('fee_platform')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nilai = Number((data as any)?.fee_platform || 0)
  return Number.isFinite(nilai) && nilai > 0 ? Math.round(nilai) : 0
}

export async function simpanFeePlatform(nilai: number, oleh: string): Promise<string> {
  if (!(await tabelPlatformAda())) {
    return 'Tabel pengaturan_platform belum ada. Jalankan SQL migrasi fee dulu.'
  }
  const bersih = Math.max(0, Math.round(Number(nilai) || 0))
  const { data: lama } = await supabase
    .from('pengaturan_platform')
    .select('id')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const isi = {
    fee_platform: bersih,
    updated_at: new Date().toISOString(),
    updated_by: oleh
  }

  const { error } = lama?.id
    ? await supabase.from('pengaturan_platform').update(isi).eq('id', (lama as any).id)
    : await supabase.from('pengaturan_platform').insert([isi])

  if (error) return 'Gagal menyimpan fee platform: ' + error.message
  return ''
}

// ==================== SNAPSHOT SAAT MENJUAL ====================
/** Minimal data profil yang dibutuhkan untuk fee. */
type ProfilFee = { fee?: number | null; id?: string }

/** Fee penjual (agen) yang tersimpan di profilnya sekarang. */
export function feeProfil(profile: ProfilFee | null | undefined): number {
  const nilai = Number((profile as any)?.fee || 0)
  return Number.isFinite(nilai) && nilai > 0 ? Math.round(nilai) : 0
}

/**
 * Nilai fee yang ditempel ke baris pesanan saat menjual.
 * Mengembalikan objek kosong kalau kolom snapshot belum ada, supaya insert
 * penjualan tidak gagal sebelum SQL migrasi dijalankan.
 */
export async function snapshotFee(profile: ProfilFee | null | undefined): Promise<Record<string, number>> {
  if (!(await feePesananAda())) return {}
  return {
    fee_agen: feeProfil(profile),
    fee_platform: await ambilFeePlatform()
  }
}
