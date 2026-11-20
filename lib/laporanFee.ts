// lib/laporanFee.ts
// Pengambilan + pengelompokan data Laporan Fee (per agen & per platform).
//
// Pembacaan memakai pola halaman laporan lain (klien anon + filter di browser),
// lalu hasilnya disaring per identitas penjual (pesanan.petugas_jual berisi
// nomor HP / email / nama).
import { supabase, type Profile } from './supabase'
import { ambilOperatorKapal, pemilikJadwal, idOperator } from './tenant'
import {
  KANAL_OFFLINE,
  ambilFeePlatform,
  feePesananAda,
  feeProfil,
  kodeUntukLokasi,
  petaKodeKota
} from './fee'
import { daftarTanggalBulan, parseBulan } from './periode'

export type PenjualFee = {
  id: string
  nama: string
  email: string
  nomor_hp: string
  lokasi: string
  fee: number
  kode: string
}

export type BarisFee = {
  kunci: string
  tanggal: string
  jam: string
  kapal: string
  tiket: number
  fee: number
  total: number
}

export type BlokFee = {
  penjual: PenjualFee
  baris: BarisFee[]
  tiket: number
  total: number
}

export type HasilLaporanFee = {
  blok: BlokFee[]
  totalTiket: number
  totalFee: number
  /** Tiket yang penjualnya tidak dikenali (mis. akun agen sudah dihapus). */
  tiketTanpaPenjual: number
  error?: string
}

export type OpsiLaporanFee = {
  profile: Profile
  mode: 'harian' | 'bulanan'
  /** Daerah (lokasi agen) yang dibuka. Kosong = mode "agen sendiri". */
  lokasi?: string
  /** Tanggal (YYYY-MM-DD) untuk mode harian. */
  tanggal?: string
  /** Bulan (YYYY-MM) untuk mode bulanan. */
  bulan?: string
  /** true = hanya data agen yang sedang login. */
  sayaSendiri?: boolean
}

// ==================== IDENTITAS PENJUAL ====================
function tambahVariasiHp(hasil: string[], nomor: string) {
  const digit = String(nomor || '').replace(/\D/g, '')
  if (!digit) return
  hasil.push(digit, digit.replace(/^62/, '0'), digit.replace(/^0/, '62'))
  if (digit.length > 9) hasil.push(digit.slice(-9))
}

function identitasProfil(p: {
  nama?: string | null
  email?: string | null
  nomor_hp?: string | null
}): Set<string> {
  const hasil: string[] = []
  const nama = String(p.nama || '').trim().toLowerCase()
  if (nama) hasil.push(nama)
  const email = String(p.email || '').trim().toLowerCase()
  if (email) hasil.push(email)
  tambahVariasiHp(hasil, String(p.nomor_hp || ''))
  return new Set(hasil)
}

function identitasPesanan(mentah: string | null): string[] {
  const teks = String(mentah || '').trim().toLowerCase()
  if (!teks) return []
  const hasil: string[] = [teks]
  const depan = teks.includes('@') ? teks.split('@')[0] : teks
  const digit = depan.replace(/\D/g, '')
  if (digit) {
    hasil.push(digit, digit.replace(/^62/, '0'), digit.replace(/^0/, '62'))
    if (digit.length > 9) hasil.push(digit.slice(-9))
  }
  return hasil
}

function cocokPenjual(petugasJual: string | null, identitas: Set<string>): boolean {
  return identitasPesanan(petugasJual).some((x) => identitas.has(x))
}

// ==================== DAFTAR PENJUAL (AGEN) ====================
export async function muatPenjualFee(opts: {
  profile: Profile
  lokasi?: string
  sayaSendiri?: boolean
}): Promise<PenjualFee[]> {
  const { profile, lokasi, sayaSendiri } = opts
  const petaKota = await petaKodeKota()

  const kePenjual = (p: any): PenjualFee => ({
    id: p.id,
    nama: String(p.nama || '').trim() || '-',
    email: String(p.email || '').trim(),
    nomor_hp: String(p.nomor_hp || '').trim(),
    lokasi: String(p.lokasi || '').trim(),
    fee: feeProfil(p),
    kode: kodeUntukLokasi(String(p.lokasi || '').trim(), petaKota)
  })

  if (sayaSendiri || profile.role === 'agen') {
    // Sesi login tidak menyimpan kolom fee, jadi ambil profil terbaru dari DB
    // (select * aman walau kolom fee belum ada).
    const { data } = await supabase.from('profiles').select('*').eq('id', profile.id).maybeSingle()
    return [kePenjual(data || profile)]
  }
  if (profile.role === 'superadmin') return []

  const operatorId = idOperator(profile)
  let query = supabase.from('profiles').select('*').eq('role', 'agen').order('nama')
  if (operatorId) query = query.eq('operator_id', operatorId)

  const { data } = await query
  let daftar = (data || []).map(kePenjual)

  if (lokasi) {
    const kunci = lokasi.trim().toLowerCase()
    daftar = daftar.filter((p) => p.lokasi.trim().toLowerCase() === kunci)
  }

  return daftar
}

/** Semua lokasi agen milik penyewa (untuk kartu "Laporan Fee <daerah>"). */
export async function muatLokasiAgen(profile: Profile): Promise<string[]> {
  if (profile.role !== 'admin_utama' && profile.role !== 'superadmin') return []
  const operatorId = idOperator(profile)

  let query = supabase.from('profiles').select('lokasi, role').eq('role', 'agen')
  if (operatorId) query = query.eq('operator_id', operatorId)
  const { data } = await query

  const hasil: string[] = []
  ;(data || []).forEach((p: any) => {
    const lokasi = String(p.lokasi || '').trim()
    if (!lokasi) return
    if (hasil.some((x) => x.toLowerCase() === lokasi.toLowerCase())) return
    hasil.push(lokasi)
  })
  return hasil
}

// ==================== LAPORAN FEE AGEN ====================
type BarisPesananFee = {
  is_balita: boolean
  petugas_jual: string | null
  kanal: string | null
  fee_agen?: number | null
  fee_platform?: number | null
  jadwal: {
    tanggal: string | null
    jam_berangkat: string | null
    rute_asal: string | null
    operator_id: string | null
    kapal_id: string | null
    kapal?: { nama: string | null } | null
  } | null
}

export async function muatLaporanFee(opts: OpsiLaporanFee): Promise<HasilLaporanFee> {
  const { profile, mode, tanggal, bulan, sayaSendiri, lokasi } = opts
  const kosong: HasilLaporanFee = { blok: [], totalTiket: 0, totalFee: 0, tiketTanpaPenjual: 0 }

  const penjualList = await muatPenjualFee({ profile, lokasi, sayaSendiri })
  if (penjualList.length === 0) return kosong

  const pakaiSnapshot = await feePesananAda()
  const kolom = [
    'id, is_balita, kanal, petugas_jual',
    pakaiSnapshot ? 'fee_agen' : '',
    'jadwal:jadwal_id (tanggal, jam_berangkat, rute_asal, operator_id, kapal_id, kapal:kapal_id(nama))'
  ]
    .filter(Boolean)
    .join(', ')

  let query = supabase.from('pesanan').select(kolom).eq('status', 'paid').eq('kanal', 'agen')

  if (mode === 'harian') {
    query = query.eq('jadwal.tanggal', tanggal || '')
  } else {
    const tanggalList = daftarTanggalBulan(bulan || '')
    if (tanggalList.length === 0) return kosong
    query = query.gte('jadwal.tanggal', tanggalList[0]).lte('jadwal.tanggal', tanggalList[tanggalList.length - 1])
  }

  const { data, error } = await query
  if (error) return { ...kosong, error: 'Gagal memuat penjualan agen: ' + error.message }

  const operatorId = idOperator(profile)
  const petaOperatorKapal = await ambilOperatorKapal(
    ((data || []) as unknown as BarisPesananFee[]).map((p) => p.jadwal?.kapal_id)
  )

  const identitasPerPenjual = penjualList.map((p) => ({ penjual: p, identitas: identitasProfil(p) }))
  const petaBlok = new Map<string, BlokFee>()
  penjualList.forEach((p) => {
    petaBlok.set(p.id, { penjual: p, baris: [], tiket: 0, total: 0 })
  })

  let tiketTanpaPenjual = 0

  ;((data || []) as unknown as BarisPesananFee[]).forEach((pesanan) => {
    if (pesanan.is_balita) return // balita gratis: tidak kena fee
    const jadwal = pesanan.jadwal
    if (!jadwal || !jadwal.tanggal) return
    const pemilik = pemilikJadwal(jadwal, petaOperatorKapal)
    if (operatorId && pemilik !== operatorId) return

    const cocok = identitasPerPenjual.find((x) => cocokPenjual(pesanan.petugas_jual, x.identitas))
    if (!cocok) {
      tiketTanpaPenjual += 1
      return
    }

    const blok = petaBlok.get(cocok.penjual.id)
    if (!blok) return

    const jam = String(jadwal.jam_berangkat || '00:00').slice(0, 5)
    const kapal = String(jadwal.kapal?.nama || 'Kapal').trim() || 'Kapal'
    const snapshot = Number(pesanan.fee_agen || 0)
    const feeBaris = snapshot > 0 ? Math.round(snapshot) : cocok.penjual.fee

    const kunci = mode === 'harian' ? `${jam}|${kapal}` : `${jadwal.tanggal}|${kapal}`
    let baris = blok.baris.find((b) => b.kunci === kunci)
    if (!baris) {
      baris = { kunci, tanggal: jadwal.tanggal, jam, kapal, tiket: 0, fee: feeBaris, total: 0 }
      blok.baris.push(baris)
    }

    baris.tiket += 1
    baris.total = baris.tiket * baris.fee
    blok.tiket += 1
    blok.total += baris.fee
  })

  const blok = Array.from(petaBlok.values())
    .filter((b) => b.baris.length > 0)
    .sort((a, b) => a.penjual.nama.localeCompare(b.penjual.nama))

  blok.forEach((b) => {
    b.baris.sort((x, y) =>
      mode === 'harian'
        ? x.jam.localeCompare(y.jam) || x.kapal.localeCompare(y.kapal)
        : x.tanggal.localeCompare(y.tanggal) || x.kapal.localeCompare(y.kapal)
    )
    // Fee bisa berubah di tengah periode (snapshot), jadi total dihitung
    // ulang dari baris.
    b.total = b.baris.reduce((sum, x) => sum + x.total, 0)
  })

  return {
    blok,
    totalTiket: blok.reduce((sum, b) => sum + b.tiket, 0),
    totalFee: blok.reduce((sum, b) => sum + b.total, 0),
    tiketTanpaPenjual
  }
}

// ==================== RINCIAN PER JAM (AGEN) ====================
export type RincianFee = {
  id: string
  nama_penumpang: string
  kursi: string
  kode_tiket: string
  metode: string
  harga: number
}

export async function muatRincianFee(opts: {
  penjual: PenjualFee
  tanggal: string
  jam?: string
  kapal?: string
}): Promise<{ baris: RincianFee[]; error?: string }> {
  const { penjual, tanggal, jam, kapal } = opts
  const identitas = identitasProfil(penjual)

  const { data, error } = await supabase
    .from('pesanan')
    .select(`
      id, nama_penumpang, kode_tiket, is_balita, petugas_jual, created_at,
      jadwal:jadwal_id (tanggal, jam_berangkat, kapal_id, harga, kapal:kapal_id(nama)),
      kursi:kursi_id (nomor_kursi),
      pembayaran:pembayaran (metode)
    `)
    .eq('status', 'paid')
    .eq('kanal', 'agen')
    .eq('jadwal.tanggal', tanggal)
    .order('created_at', { ascending: true })

  if (error) return { baris: [], error: 'Gagal memuat rincian: ' + error.message }

  const baris: RincianFee[] = []
  ;(data || []).forEach((item: any) => {
    if (item.is_balita) return
    if (!cocokPenjual(item.petugas_jual, identitas)) return
    const jamPesanan = String(item.jadwal?.jam_berangkat || '').slice(0, 5)
    const namaKapal = String(item.jadwal?.kapal?.nama || 'Kapal').trim()
    if (jam && jamPesanan !== jam) return
    if (kapal && namaKapal.toLowerCase() !== kapal.toLowerCase()) return

    let metode = 'cash'
    if (Array.isArray(item.pembayaran) && item.pembayaran.length > 0) metode = item.pembayaran[0].metode
    else if (item.pembayaran?.metode) metode = item.pembayaran.metode

    baris.push({
      id: item.id,
      nama_penumpang: item.nama_penumpang,
      kursi: item.kursi?.nomor_kursi || '-',
      kode_tiket: item.kode_tiket,
      metode,
      harga: Number(item.jadwal?.harga || 0)
    })
  })

  return { baris }
}

// ==================== LAPORAN FEE PLATFORM ====================
export type BarisPlatform = {
  kunci: string
  tanggal: string
  jam: string
  kapal: string
  tiket: number
  fee: number
  total: number
}

export type BlokPlatform = {
  operatorId: string
  namaPenyewa: string
  baris: BarisPlatform[]
  tiket: number
  total: number
}

export type HasilLaporanPlatform = {
  blok: BlokPlatform[]
  totalTiket: number
  totalFee: number
  /** Fee platform yang berlaku sekarang (dipakai transaksi lama tanpa snapshot). */
  feeBerlaku: number
  error?: string
}

export async function muatLaporanFeePlatform(opts: {
  mode: 'harian' | 'bulanan'
  tanggal?: string
  bulan?: string
}): Promise<HasilLaporanPlatform> {
  const { mode, tanggal, bulan } = opts
  const feeBerlaku = await ambilFeePlatform()
  const kosong: HasilLaporanPlatform = { blok: [], totalTiket: 0, totalFee: 0, feeBerlaku }

  const pakaiSnapshot = await feePesananAda()
  const kolom = [
    'id, is_balita, kanal, petugas_jual',
    pakaiSnapshot ? 'fee_platform' : '',
    'jadwal:jadwal_id (tanggal, jam_berangkat, rute_asal, operator_id, kapal_id, kapal:kapal_id(nama))'
  ]
    .filter(Boolean)
    .join(', ')

  let query = supabase.from('pesanan').select(kolom).eq('status', 'paid').in('kanal', [...KANAL_OFFLINE])

  if (mode === 'harian') {
    query = query.eq('jadwal.tanggal', tanggal || '')
  } else {
    const tanggalList = daftarTanggalBulan(bulan || '')
    if (tanggalList.length === 0) return kosong
    query = query.gte('jadwal.tanggal', tanggalList[0]).lte('jadwal.tanggal', tanggalList[tanggalList.length - 1])
  }

  const { data, error } = await query
  if (error) return { ...kosong, error: 'Gagal memuat penjualan offline: ' + error.message }

  const petaOperatorKapal = await ambilOperatorKapal(
    ((data || []) as unknown as BarisPesananFee[]).map((p) => p.jadwal?.kapal_id)
  )

  const { data: penyewa } = await supabase
    .from('profiles')
    .select('id, nama, nama_perusahaan, role')
    .eq('role', 'admin_utama')
  const namaPenyewa = new Map<string, string>()
  ;(penyewa || []).forEach((p: any) => {
    namaPenyewa.set(p.id, String(p.nama_perusahaan || p.nama || '').trim() || 'Penyewa')
  })

  const petaBlok = new Map<string, BlokPlatform>()

  ;((data || []) as unknown as BarisPesananFee[]).forEach((pesanan) => {
    if (pesanan.is_balita) return
    const jadwal = pesanan.jadwal
    if (!jadwal || !jadwal.tanggal) return

    const pemilik = pemilikJadwal(jadwal, petaOperatorKapal) || 'tanpa-penyewa'
    if (!petaBlok.has(pemilik)) {
      petaBlok.set(pemilik, {
        operatorId: pemilik,
        namaPenyewa: namaPenyewa.get(pemilik) || 'Penyewa tidak terdaftar',
        baris: [],
        tiket: 0,
        total: 0
      })
    }
    const blok = petaBlok.get(pemilik)!
    if (!blok) return

    const jam = String(jadwal.jam_berangkat || '00:00').slice(0, 5)
    const kapal = String(jadwal.kapal?.nama || 'Kapal').trim() || 'Kapal'
    const snapshot = Number(pesanan.fee_platform || 0)
    const feeBaris = snapshot > 0 ? Math.round(snapshot) : feeBerlaku

    const kunci = mode === 'harian' ? `${jam}|${kapal}` : `${jadwal.tanggal}|${kapal}`
    let baris = blok.baris.find((b) => b.kunci === kunci)
    if (!baris) {
      baris = { kunci, tanggal: jadwal.tanggal, jam, kapal, tiket: 0, fee: feeBaris, total: 0 }
      blok.baris.push(baris)
    }

    baris.tiket += 1
    baris.total = baris.tiket * baris.fee
    blok.tiket += 1
    blok.total += baris.fee
  })

  const blok = Array.from(petaBlok.values()).sort((a, b) => a.namaPenyewa.localeCompare(b.namaPenyewa))
  blok.forEach((b) => {
    b.baris.sort((x, y) =>
      mode === 'harian'
        ? x.jam.localeCompare(y.jam) || x.kapal.localeCompare(y.kapal)
        : x.tanggal.localeCompare(y.tanggal) || x.kapal.localeCompare(y.kapal)
    )
    b.total = b.baris.reduce((sum, x) => sum + x.total, 0)
  })

  return {
    blok,
    totalTiket: blok.reduce((sum, b) => sum + b.tiket, 0),
    totalFee: blok.reduce((sum, b) => sum + b.total, 0),
    feeBerlaku
  }
}

/** Rincian penjualan offline untuk Fee Platform (tanpa nama penumpang). */
export type RincianPlatform = {
  jam: string
  kapal: string
  penjual: string
  tiket: number
  fee: number
  total: number
}

export async function muatRincianPlatform(opts: {
  tanggal: string
  operatorId?: string
  jam?: string
  kapal?: string
}): Promise<{ baris: RincianPlatform[]; error?: string }> {
  const { tanggal, operatorId, jam, kapal } = opts
  const feeBerlaku = await ambilFeePlatform()
  const pakaiSnapshot = await feePesananAda()
  const kolom = [
    'id, is_balita, kanal, petugas_jual',
    pakaiSnapshot ? 'fee_platform' : '',
    'jadwal:jadwal_id (tanggal, jam_berangkat, operator_id, kapal_id, kapal:kapal_id(nama))'
  ]
    .filter(Boolean)
    .join(', ')

  const { data, error } = await supabase
    .from('pesanan')
    .select(kolom)
    .eq('status', 'paid')
    .in('kanal', [...KANAL_OFFLINE])
    .eq('jadwal.tanggal', tanggal)

  if (error) return { baris: [], error: 'Gagal memuat rincian: ' + error.message }

  const petaOperatorKapal = await ambilOperatorKapal(((data || []) as any[]).map((p) => p.jadwal?.kapal_id))

  const peta = new Map<string, RincianPlatform>()
  ;((data || []) as any[]).forEach((pesanan) => {
    if (pesanan.is_balita) return
    const jadwal = pesanan.jadwal
    if (!jadwal) return
    const pemilik = pemilikJadwal(jadwal, petaOperatorKapal) || 'tanpa-penyewa'
    if (operatorId && pemilik !== operatorId) return

    const jamPesanan = String(jadwal.jam_berangkat || '00:00').slice(0, 5)
    const namaKapal = String(jadwal.kapal?.nama || 'Kapal').trim() || 'Kapal'
    if (jam && jamPesanan !== jam) return
    if (kapal && namaKapal.toLowerCase() !== kapal.toLowerCase()) return

    const penjual = String(pesanan.petugas_jual || 'Tanpa penjual').trim()
    const snapshot = Number(pesanan.fee_platform || 0)
    const feeBaris = snapshot > 0 ? Math.round(snapshot) : feeBerlaku
    const kunci = `${jamPesanan}|${namaKapal}|${penjual}`

    let baris = peta.get(kunci)
    if (!baris) {
      baris = { jam: jamPesanan, kapal: namaKapal, penjual, tiket: 0, fee: feeBaris, total: 0 }
      peta.set(kunci, baris)
    }
    baris.tiket += 1
    baris.total = baris.tiket * baris.fee
  })

  return {
    baris: Array.from(peta.values()).sort(
      (a, b) => a.jam.localeCompare(b.jam) || a.kapal.localeCompare(b.kapal) || a.penjual.localeCompare(b.penjual)
    )
  }
}

/** Bulan "YYYY-MM" yang valid, atau string kosong. */
export function bulanValid(bulan: string | null | undefined): string {
  return parseBulan(bulan) ? String(bulan) : ''
}
