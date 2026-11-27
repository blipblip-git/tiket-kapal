// lib/fee.ts
// Helper Laporan Fee (fee agen per tiket + fee platform per kanal).
//
// Aturan:
// - Fee AGEN diisi Admin Utama saat mendaftarkan agen (profiles.fee). Fee itu
//   mengurangi uang penjualan pemilik, dihitung PER TIKET DEWASA, dan HANYA
//   berlaku untuk penjualan kanal 'agen'.
// - Fee PLATFORM punya 2 tarif: fee_offline (petugas/agen) dan fee_online (web).
//   Tarif dipilih sesuai kanal dan TIDAK PERNAH dijumlah (online tidak kena
//   tarif offline, offline tidak kena tarif online).
// - Nilai fee "dibekukan" saat transaksi (snapshot) di kolom
//   pesanan.fee_agen & pesanan.fee_platform. Kalau kolom/belum ada isinya
//   (transaksi lama), laporan memakai fee yang berlaku sekarang.
// - Semua probe kolom dilakukan sekali per muat halaman, jadi aplikasi tetap
//   jalan walau SQL migrasi fee belum dijalankan.
import { supabase } from './supabase'

// Penjualan hanya punya 3 kanal: 'petugas' (semua akun staf), 'agen', 'online'.
// Label lama ('loket', 'mobile', 'keberangkatan') tetap didaftarkan supaya
// tiket/backup lama tidak hilang dari laporan fee, tetapi penjualan BARU selalu
// ditulis 'petugas'.
export const KANAL_PETUGAS = ['petugas', 'loket', 'mobile', 'keberangkatan'] as const
export const KANAL_OFFLINE = [...KANAL_PETUGAS, 'agen'] as const
export const KANAL_ONLINE = ['online'] as const

// Fee PLATFORM berlaku untuk SEMUA penjualan. Tarifnya BEDA per kanal
// (offline / online) dan tidak pernah dijumlah: online memakai fee_online saja.
export const KANAL_FEE_PLATFORM = [...KANAL_OFFLINE, ...KANAL_ONLINE] as const

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
  berau: 'BRU',
  bunyu: 'BNY',
  'kabupaten tanah tidung': 'KTT',
  malinau: 'MLN',
  nunukan: 'NNK',
  sebatik: 'SBK',
  sembakung: 'SMG',
  'sungai nyamuk': 'SNK',
  'tanah kuning': 'TKG',
  tarakan: 'TRK',
  'tanjung batu': 'TJB',
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

// ==================== FEE PLATFORM (tarif per kanal) ====================
export type TarifFee = { offline: number; online: number }

let cekKolomTarif: boolean | null = null

/** Apakah kolom pengaturan_platform.fee_offline & fee_online sudah ada? */
export async function feeKanalAda(): Promise<boolean> {
  if (cekKolomTarif !== null) return cekKolomTarif
  const { error } = await supabase.from('pengaturan_platform').select('fee_offline, fee_online').limit(1)
  cekKolomTarif = !error
  return cekKolomTarif
}

function angkaFee(nilai: unknown, cadangan = 0): number {
  const n = Number(nilai)
  if (!Number.isFinite(n) || n <= 0) return Math.max(0, Math.round(cadangan) || 0)
  return Math.round(n)
}

/**
 * Fee platform 1 tiket: pakai snapshot pesanan kalau ada; kalau belum ada
 * (tiket lama), pakai tarif sesuai kanal tiket (online / offline).
 */
export function feePlatformBaris(
  baris: { fee_platform?: number | null; kanal?: string | null } | null | undefined,
  tarif: TarifFee
): number {
  const snapshot = Number(baris?.fee_platform || 0)
  if (Number.isFinite(snapshot) && snapshot > 0) return Math.round(snapshot)
  return String(baris?.kanal || '').trim().toLowerCase() === 'online' ? tarif.online : tarif.offline
}

/**
 * Tarif fee platform yang berlaku sekarang.
 * Offline = petugas/agen, Online = penjualan web. Dipakai terpisah (tidak
 * pernah dijumlah) supaya pemilik tidak kena 3.000 + 5.000.
 */
export async function ambilTarifFee(): Promise<TarifFee> {
  if (!(await tabelPlatformAda())) return { offline: 0, online: 0 }

  const pakaiKanal = await feeKanalAda()
  const { data } = await supabase
    .from('pengaturan_platform')
    .select(pakaiKanal ? 'fee_offline, fee_online, fee_platform' : 'fee_platform')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const baris = (data || {}) as Record<string, unknown>
  const lama = angkaFee(baris.fee_platform)
  if (!pakaiKanal) return { offline: lama, online: lama }

  const offline = angkaFee(baris.fee_offline, lama)
  const online = angkaFee(baris.fee_online, offline)
  return { offline, online }
}

/** Tarif fee offline (dulu satu-satunya nilai). */
export async function ambilFeePlatform(): Promise<number> {
  return (await ambilTarifFee()).offline
}

/** Tarif fee khusus penjualan online (web). */
export async function ambilFeeOnline(): Promise<number> {
  return (await ambilTarifFee()).online
}

/** Simpan tarif offline & online sekaligus (kolom lama fee_platform = offline). */
export async function simpanFeeKanal(tarif: TarifFee, oleh: string): Promise<string> {
  if (!(await tabelPlatformAda())) {
    return 'Tabel pengaturan_platform belum ada. Jalankan SQL migrasi fee dulu.'
  }
  if (!(await feeKanalAda())) {
    return 'Kolom fee_offline/fee_online belum ada. Jalankan SQL migrasi fee-kanal dulu.'
  }

  const offline = Math.max(0, Math.round(Number(tarif.offline) || 0))
  const online = Math.max(0, Math.round(Number(tarif.online) || 0))

  const { data: lama } = await supabase
    .from('pengaturan_platform')
    .select('id')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const isi = {
    fee_offline: offline,
    fee_online: online,
    fee_platform: offline, // kolom lama: tetap cermin tarif offline
    updated_at: new Date().toISOString(),
    updated_by: oleh
  }

  const { error } = lama?.id
    ? await supabase.from('pengaturan_platform').update(isi).eq('id', (lama as any).id)
    : await supabase.from('pengaturan_platform').insert([isi])

  if (error) return 'Gagal menyimpan fee platform: ' + error.message
  return ''
}

/** Kompatibilitas: hanya mengubah tarif offline, tarif online dipertahankan. */
export async function simpanFeePlatform(nilai: number, oleh: string): Promise<string> {
  const tarif = await ambilTarifFee()
  return simpanFeeKanal({ offline: nilai, online: tarif.online }, oleh)
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
 * - online : fee_platform = tarif online, fee_agen = 0 (tidak pernah dijumlah).
 * - agen   : fee_platform = tarif offline + fee agen (komisi agen).
 * - petugas: fee_platform = tarif offline, fee_agen = 0.
 * Mengembalikan objek kosong kalau kolom snapshot belum ada, supaya insert
 * penjualan tidak gagal sebelum SQL migrasi dijalankan.
 */
export async function snapshotFee(
  profile: ProfilFee | null | undefined,
  kanal?: string
): Promise<Record<string, number>> {
  if (!(await feePesananAda())) return {}

  const kanalBersih = String(kanal || '').trim().toLowerCase()
  const online = kanalBersih === 'online'
  const agen = kanalBersih === 'agen' || kanalBersih === ''
  const tarif = await ambilTarifFee()

  return {
    fee_agen: online ? 0 : agen ? feeProfil(profile) : 0,
    fee_platform: online ? tarif.online : tarif.offline
  }
}

