// lib/payment/wadah.ts
// WADAH DANA: transaksi dikelompokkan per KAPAL, uang ditransfer per PT.
//
// Kenapa dipisah:
// - Closing mengikuti jadwal kapal, jadi wadah transaksi harus kapal.
// - Rekening yang ditransfer atas nama PT (profiles.nama_perusahaan), dan satu
//   PT boleh punya beberapa kapal -> beberapa wadah kapal digabung jadi SATU
//   transfer supaya biaya transfer (Rp3.000) tidak dikali jumlah kapal.
//
// Pencairan TIDAK pernah per tiket: wadah ditutup -> digabung -> ditransfer.
// Semua penulisan lewat RPC di supabase/wadah-kapal.sql (atomik, anti dobel).
//
// Hanya untuk SERVER (service role lewat buatClientAdmin()).

import type { SupabaseClient } from '@supabase/supabase-js'

const ALFABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Kode pendek kapal untuk awalan kode bayar, mis. "Sadewa Jaya" -> "SAD". */
export function kodeKapal(nama: string | null | undefined): string {
  const akar = String(nama || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 3)
  return akar || 'KPL'
}

/** YYMMDD versi WITA (UTC+8) supaya transaksi malam tidak jatuh ke tanggal kemarin. */
export function tanggalKode(waktu: Date = new Date()): string {
  const wita = new Date(waktu.getTime() + 8 * 60 * 60 * 1000)
  const yy = String(wita.getUTCFullYear()).slice(2)
  const mm = String(wita.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(wita.getUTCDate()).padStart(2, '0')
  return `${yy}${mm}${dd}`
}

function acakKode(panjang = 4): string {
  const buf = new Uint8Array(panjang)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buf)
  } else {
    for (let i = 0; i < panjang; i++) buf[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(buf).map((b) => ALFABET[b % ALFABET.length]).join('')
}

/**
 * Kode bayar yang membawa identitas kapal, mis. "SDW-261127-K7Q2".
 * Awalan ini yang membuat mutasi bank bisa langsung dibaca: uang masuk untuk
 * kapal mana, tanpa perlu membuka aplikasi.
 */
export function buatKodeBayarWadah(namaAtauKodeKapal: string | null | undefined, waktu: Date = new Date()): string {
  return `${kodeKapal(namaAtauKodeKapal)}-${tanggalKode(waktu)}-${acakKode(4)}`
}

export type BarisWadahKapal = {
  operator_id: string | null
  nama_pt: string | null
  kapal_id: string | null
  kode_kapal: string | null
  nama_kapal: string | null
  tanggal: string
  jumlah_tagihan: number
  jumlah_tiket: number
  total_dasar: number
  total_biaya_layanan: number
  total_mdr: number
  bagian_pemilik: number
  bagian_platform: number
  bagian_agen: number
  ditahan: number
  dicairkan: number
}

export type BarisWadahPemilik = {
  operator_id: string | null
  nama_pt: string | null
  tanggal: string
  jumlah_kapal: number
  jumlah_tagihan: number
  jumlah_tiket: number
  total_dasar: number
  bagian_pemilik: number
  bagian_platform: number
  bagian_agen: number
  ditahan: number
  dicairkan: number
}

export type ClosingKapal = {
  id: string
  operator_id: string | null
  kapal_id: string | null
  kode_kapal: string | null
  nama_kapal: string | null
  nama_pt: string | null
  tanggal: string
  status: string
  jumlah_tagihan: number
  jumlah_tiket: number
  total_dasar: number
  total_biaya_layanan: number
  total_mdr: number
  bagian_pemilik: number
  bagian_platform: number
  bagian_agen: number
  rekening_id: string | null
  bukti_url: string | null
  catatan: string | null
  ditutup_at: string | null
  ditransfer_at: string | null
}

export type TransferPemilik = {
  id: string
  operator_id: string
  nama_pt: string | null
  periode_dari: string
  periode_sampai: string
  jumlah_kapal: number
  nominal: number
  rekening_id: string | null
  bank_kode: string | null
  nomor_rekening: string | null
  nama_rekening: string | null
  status: string
  pg_ref: string | null
  bukti_url: string | null
  catatan: string | null
  dibuat_at: string
  dikirim_at: string | null
}

type OpsiPeriode = {
  dari: string
  sampai: string
  /** Kalau diisi, hanya wadah milik PT ini (dipakai halaman pemilik). */
  operatorId?: string | null
}

/** Rekap wadah per kapal per tanggal (dasar untuk halaman closing). */
export async function daftarWadahKapal(
  admin: SupabaseClient,
  opsi: OpsiPeriode
): Promise<BarisWadahKapal[]> {
  let kueri = admin
    .from('v_wadah_kapal')
    .select('*')
    .gte('tanggal', opsi.dari)
    .lte('tanggal', opsi.sampai)

  if (opsi.operatorId) kueri = kueri.eq('operator_id', opsi.operatorId)

  const { data, error } = await kueri
    .order('tanggal', { ascending: true })
    .order('nama_kapal', { ascending: true })

  if (error) throw new Error(`Gagal membaca wadah kapal: ${error.message}`)
  return (data || []) as BarisWadahKapal[]
}

/** Rekap wadah per PT (semua kapalnya sudah dijumlah) per tanggal. */
export async function daftarWadahPemilik(
  admin: SupabaseClient,
  opsi: OpsiPeriode
): Promise<BarisWadahPemilik[]> {
  let kueri = admin
    .from('v_wadah_pemilik')
    .select('*')
    .gte('tanggal', opsi.dari)
    .lte('tanggal', opsi.sampai)

  if (opsi.operatorId) kueri = kueri.eq('operator_id', opsi.operatorId)

  const { data, error } = await kueri
    .order('tanggal', { ascending: true })
    .order('nama_pt', { ascending: true })

  if (error) throw new Error(`Gagal membaca wadah pemilik: ${error.message}`)
  return (data || []) as BarisWadahPemilik[]
}

/** Jumlahkan beberapa baris wadah PT jadi satu angka transfer. */
export function ringkasWadahPemilik(baris: BarisWadahPemilik[]): {
  namaPt: string
  jumlahKapal: number
  jumlahTagihan: number
  jumlahTiket: number
  bagianPemilik: number
  bagianPlatform: number
  bagianAgen: number
  ditahan: number
  dicairkan: number
} {
  const hasil = {
    namaPt: baris[0]?.nama_pt || 'Pemilik',
    jumlahKapal: 0,
    jumlahTagihan: 0,
    jumlahTiket: 0,
    bagianPemilik: 0,
    bagianPlatform: 0,
    bagianAgen: 0,
    ditahan: 0,
    dicairkan: 0,
  }

  for (const b of baris) {
    hasil.jumlahTagihan += Number(b.jumlah_tagihan || 0)
    hasil.jumlahTiket += Number(b.jumlah_tiket || 0)
    hasil.bagianPemilik += Number(b.bagian_pemilik || 0)
    hasil.bagianPlatform += Number(b.bagian_platform || 0)
    hasil.bagianAgen += Number(b.bagian_agen || 0)
    hasil.ditahan += Number(b.ditahan || 0)
    hasil.dicairkan += Number(b.dicairkan || 0)
    // jumlah_kapal di view sudah dihitung per PT per tanggal (distinct kapal).
    hasil.jumlahKapal = Math.max(hasil.jumlahKapal, Number(b.jumlah_kapal || 0))
  }

  return hasil
}

/**
 * Tutup wadah satu kapal pada satu tanggal. Hanya tagihan berstatus 'paid'
 * yang dihitung. Aman dipanggil berulang (upsert), tapi wadah yang sudah
 * 'selesai' tidak diturunkan statusnya.
 */
export async function tutupWadahKapal(
  admin: SupabaseClient,
  opsi: { kapalId: string; tanggal: string; oleh?: string | null }
): Promise<ClosingKapal> {
  const { data, error } = await admin.rpc('tutup_wadah_kapal', {
    p_kapal_id: opsi.kapalId,
    p_tanggal: opsi.tanggal,
    p_oleh: opsi.oleh || null,
  })

  if (error) throw new Error(`Gagal menutup wadah kapal: ${error.message}`)
  if (!data) throw new Error('Wadah kapal kosong: tidak ada tagihan lunas pada tanggal itu.')
  return data as ClosingKapal
}

/**
 * Siapkan SATU transfer untuk semua wadah kapal milik satu PT dalam rentang
 * tanggal. Rekening wajib sudah berstatus 'aktif' di rekening_penerima.
 */
export async function siapkanTransferPemilik(
  admin: SupabaseClient,
  opsi: { operatorId: string; dari: string; sampai: string; oleh?: string | null }
): Promise<TransferPemilik> {
  const { data, error } = await admin.rpc('siapkan_transfer_pemilik', {
    p_operator_id: opsi.operatorId,
    p_dari: opsi.dari,
    p_sampai: opsi.sampai,
    p_oleh: opsi.oleh || null,
  })

  if (error) throw new Error(`Gagal menyiapkan transfer pemilik: ${error.message}`)
  if (!data) throw new Error('Tidak ada wadah siap transfer.')
  return data as TransferPemilik
}

/** Catat bukti transfer / status pengiriman batch transfer PT. */
export async function tandaiTransferPemilik(
  admin: SupabaseClient,
  opsi: {
    transferId: string
    status?: 'menunggu' | 'dikirim' | 'selesai' | 'gagal'
    buktiUrl?: string | null
    pgRef?: string | null
    catatan?: string | null
  }
): Promise<void> {
  const status = opsi.status || 'dikirim'
  const sekarang = new Date().toISOString()

  const { error } = await admin
    .from('transfer_pemilik')
    .update({
      status,
      bukti_url: opsi.buktiUrl ?? null,
      pg_ref: opsi.pgRef ?? null,
      catatan: opsi.catatan ?? null,
      dikirim_at: status === 'menunggu' ? null : sekarang,
    })
    .eq('id', opsi.transferId)

  if (error) throw new Error(`Gagal memperbarui transfer: ${error.message}`)

  if (status === 'selesai' || status === 'gagal') {
    const { data: item } = await admin
      .from('transfer_pemilik_item')
      .select('closing_kapal_id')
      .eq('transfer_id', opsi.transferId)

    const ids = (item || []).map((i) => String((i as { closing_kapal_id: string }).closing_kapal_id))
    if (ids.length === 0) return

    const { error: errClosing } = await admin
      .from('closing_kapal')
      .update({ status: status === 'selesai' ? 'selesai' : 'dibatalkan', updated_at: sekarang })
      .in('id', ids)

    if (errClosing) {
      throw new Error(`Transfer tercatat, tapi wadah gagal diperbarui: ${errClosing.message}`)
    }
  }
}

/**
 * Daftar PT yang punya wadah 'dihitung' dan belum masuk batch transfer,
 * dipakai halaman "Siap Transfer".
 */
export async function daftarSiapTransfer(
  admin: SupabaseClient,
  opsi: OpsiPeriode
): Promise<
  Array<{
    operator_id: string
    nama_pt: string | null
    jumlah_kapal: number
    nominal: number
    tanggal_awal: string
    tanggal_akhir: string
  }>
> {
  let kueri = admin
    .from('closing_kapal')
    .select('operator_id, nama_pt, bagian_pemilik, tanggal, kapal_id')
    .eq('status', 'dihitung')
    .gte('tanggal', opsi.dari)
    .lte('tanggal', opsi.sampai)

  if (opsi.operatorId) kueri = kueri.eq('operator_id', opsi.operatorId)

  const { data, error } = await kueri
  if (error) throw new Error(`Gagal membaca wadah siap transfer: ${error.message}`)

  const peta = new Map<
    string,
    {
      operator_id: string
      nama_pt: string | null
      kapal: Set<string>
      nominal: number
      tanggal_awal: string
      tanggal_akhir: string
    }
  >()

  const baris = (data || []) as Array<{
    operator_id: string | null
    nama_pt: string | null
    bagian_pemilik: number
    tanggal: string
    kapal_id: string | null
  }>

  for (const b of baris) {
    if (!b.operator_id) continue
    const isi = peta.get(b.operator_id) || {
      operator_id: b.operator_id,
      nama_pt: b.nama_pt,
      kapal: new Set<string>(),
      nominal: 0,
      tanggal_awal: b.tanggal,
      tanggal_akhir: b.tanggal,
    }
    if (b.kapal_id) isi.kapal.add(b.kapal_id)
    isi.nominal += Number(b.bagian_pemilik || 0)
    if (b.tanggal < isi.tanggal_awal) isi.tanggal_awal = b.tanggal
    if (b.tanggal > isi.tanggal_akhir) isi.tanggal_akhir = b.tanggal
    peta.set(b.operator_id, isi)
  }

  return Array.from(peta.values())
    .map((p) => ({
      operator_id: p.operator_id,
      nama_pt: p.nama_pt,
      jumlah_kapal: p.kapal.size,
      nominal: p.nominal,
      tanggal_awal: p.tanggal_awal,
      tanggal_akhir: p.tanggal_akhir,
    }))
    .sort((a, b) => b.nominal - a.nominal)
}
