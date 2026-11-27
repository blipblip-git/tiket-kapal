// lib/payment/tarif.ts
// Hitungan BIAYA LAYANAN yang dibebankan ke PEMBELI.
//
// Aturan bisnis (lihat docs/PAYMENT.md):
// - `dasar` = hak pemilik kapal + fee platform (mis. 140.000 + 10.000 = 150.000).
// - `biaya layanan` = penutup biaya gateway (QRIS 0,7% / VA 4.000 / retail 5.000
//   / e-wallet 1,5%). DIBEBANKAN ke pembeli, jadi `dasar` milik pemilik/platform
//   tidak boleh ikut menyusut karena MDR.
// - Untuk biaya persen, memakai GROSS-UP r/(1-r): kalau hanya menambah r x dasar,
//   gateway menghitung MDR dari TOTAL (termasuk biaya layanan) sehingga kita
//   selalu kurang beberapa rupiah. Contoh r = 0,7%: 1.050 vs 1.058.
//
// Fungsi di sini murni (tanpa I/O) supaya mudah diuji dan dipakai halaman
// checkout maupun API.

export type TarifMetode = {
  kode: string
  nama: string
  tipe: 'qris' | 'va' | 'retail' | 'ewallet' | 'kartu' | 'manual' | string
  /** 'flat' = rupiah tetap, 'persen' = rasio (0,007 = 0,7%). */
  biayaTipe: 'flat' | 'persen'
  biayaNilai: number
  biayaMin?: number | null
  /** null/undefined = tanpa batas atas. */
  biayaMaks?: number | null
  settlementHari?: number | null
}

export type RincianTagihan = {
  dasar: number
  biayaLayanan: number
  total: number
  /** Perkiraan biaya gateway (rupiah) — harus ≤ biayaLayanan. */
  mdrEstimasi: number
  /** Perkiraan uang bersih yang diterima platform+pemilik = total - mdr. */
  neto: number
}

const batasPersen = 0.9

/** Bulatkan rupiah ke atas (jangan pernah menagih kurang dari biaya gateway). */
export function bulatKeAtas(nilai: number): number {
  if (!Number.isFinite(nilai) || nilai <= 0) return 0
  return Math.ceil(nilai - 1e-9)
}

function angkaAman(nilai: number): number {
  return Number.isFinite(nilai) ? nilai : 0
}

/**
 * Biaya layanan untuk satu tagihan.
 * persen -> gross-up r/(1-r), flat -> nilai apa adanya.
 */
export function hitungBiayaLayanan(dasar: number, tarif: TarifMetode): number {
  const dasarAman = Math.max(0, angkaAman(dasar))
  const nilai = Math.max(0, angkaAman(tarif.biayaNilai))

  let biaya = 0
  if (tarif.biayaTipe === 'persen') {
    const rasio = Math.min(nilai, batasPersen)
    biaya = rasio > 0 ? (dasarAman * rasio) / (1 - rasio) : 0
  } else {
    biaya = nilai
  }

  if (tarif.biayaMin && biaya < tarif.biayaMin) biaya = tarif.biayaMin
  if (tarif.biayaMaks != null && tarif.biayaMaks >= 0 && biaya > tarif.biayaMaks) {
    biaya = tarif.biayaMaks
  }

  return bulatKeAtas(biaya)
}

/** Perkiraan MDR yang dipotong gateway dari total tagihan. */
export function hitungMdr(total: number, tarif: TarifMetode): number {
  const totalAman = Math.max(0, angkaAman(total))
  const nilai = Math.max(0, angkaAman(tarif.biayaNilai))
  if (tarif.biayaTipe === 'persen') {
    return bulatKeAtas(totalAman * Math.min(nilai, batasPersen))
  }
  return bulatKeAtas(nilai)
}

/** Rincian lengkap yang ditampilkan di checkout / disimpan ke tabel pembayaran. */
export function rincianTagihan(dasar: number, tarif: TarifMetode): RincianTagihan {
  const dasarAman = Math.max(0, Math.round(angkaAman(dasar)))
  const biayaLayanan = hitungBiayaLayanan(dasarAman, tarif)
  const total = dasarAman + biayaLayanan
  const mdrEstimasi = hitungMdr(total, tarif)
  return {
    dasar: dasarAman,
    biayaLayanan,
    total,
    mdrEstimasi,
    neto: total - mdrEstimasi,
  }
}

/** Baris tabel `metode_bayar` -> TarifMetode (dipakai server & client). */
export function tarifDariBaris(baris: Record<string, unknown> | null | undefined): TarifMetode {
  const b = baris || {}
  return {
    kode: String(b.kode || ''),
    nama: String(b.nama || b.kode || ''),
    tipe: String(b.tipe || 'va'),
    biayaTipe: String(b.biaya_tipe || 'flat') === 'persen' ? 'persen' : 'flat',
    biayaNilai: Number(b.biaya_nilai || 0),
    biayaMin: b.biaya_min == null ? 0 : Number(b.biaya_min),
    biayaMaks: b.biaya_maks == null ? null : Number(b.biaya_maks),
    settlementHari: b.settlement_hari == null ? null : Number(b.settlement_hari),
  }
}

/**
 * Tarif cadangan kalau tabel metode_bayar belum ada (DB lama / migrasi belum
 * jalan). Angkanya sama dengan isi awal supabase/pembayaran.sql.
 */
export const TARIF_BAWAAN: Record<string, TarifMetode> = {
  qris: { kode: 'qris', nama: 'QRIS', tipe: 'qris', biayaTipe: 'persen', biayaNilai: 0.007, biayaMin: 0, settlementHari: 2 },
  va_h2: { kode: 'va_h2', nama: 'Virtual Account', tipe: 'va', biayaTipe: 'flat', biayaNilai: 4000, biayaMin: 0, settlementHari: 2 },
  retail: { kode: 'retail', nama: 'Alfamart / Indomaret', tipe: 'retail', biayaTipe: 'flat', biayaNilai: 5000, biayaMin: 0, settlementHari: 3 },
  ewallet: { kode: 'ewallet', nama: 'E-Wallet', tipe: 'ewallet', biayaTipe: 'persen', biayaNilai: 0.015, biayaMin: 0, settlementHari: 3 },
  transfer_manual: { kode: 'transfer_manual', nama: 'Transfer bank manual', tipe: 'manual', biayaTipe: 'flat', biayaNilai: 0, biayaMin: 0, settlementHari: 0 },
}

export function tarifBawaan(kode: string): TarifMetode {
  return TARIF_BAWAAN[kode] || TARIF_BAWAAN.transfer_manual
}
