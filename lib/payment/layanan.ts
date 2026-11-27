// lib/payment/layanan.ts
// "paymentService": satu-satunya tempat yang menulis tabel tagihan,
// tagihan_split, dan pesanan.tagihan_id.
//
// Hanya untuk SERVER (butuh service role lewat buatClientAdmin()).
// Gateway dipanggil lewat adapter (lib/payment/index.ts), jadi logika di sini
// tidak tahu-menahu soal iPaymu/Midtrans.

import type { SupabaseClient } from '@supabase/supabase-js'
import { ambilPaymentProvider, ambilPayoutProvider } from './index'
import { rincianTagihan, tarifBawaan, tarifDariBaris, type TarifMetode } from './tarif'
import type { PenerimaDana, RekeningTujuan, Tagihan } from './types'
import { buatKodeBayarWadah } from './wadah'

/**
 * Kode bayar membawa identitas KAPAL (mis. SDW-261127-K7Q2), supaya mutasi
 * bank bisa dibaca pemiliknya tanpa membuka aplikasi. Tanpa kapal, dipakai
 * awalan BYR (tagihan tanpa kapal, mis. biaya tambahan).
 */
export function buatKodeBayar(namaAtauKodeKapal?: string | null): string {
  return buatKodeBayarWadah(namaAtauKodeKapal || 'BYR')
}

/** Pastikan kode bayar belum dipakai (random 4 char bisa bertabrakan). */
async function kodeBayarBebas(admin: SupabaseClient, kapal: string | null | undefined): Promise<string> {
  for (let usaha = 0; usaha < 5; usaha++) {
    const kode = buatKodeBayar(kapal)
    const { data, error } = await admin.from('tagihan').select('id').eq('kode_bayar', kode).maybeSingle()
    if (error) throw new Error(`Gagal memeriksa kode bayar: ${error.message}`)
    if (!data) return kode
  }
  throw new Error('Gagal membuat kode bayar unik setelah 5 percobaan.')
}

/**
 * Rekening bank aktif milik satu PT. Dipakai supaya saat closing admin tidak
 * perlu mencari rekening lagi: baris pembagian dana sudah menunjuk rekening.
 */
export async function rekeningAktifPemilik(
  admin: SupabaseClient,
  pemilikId: string | null | undefined
): Promise<string | null> {
  if (!pemilikId) return null
  const { data, error } = await admin
    .from('rekening_penerima')
    .select('id')
    .eq('pemilik_id', pemilikId)
    .eq('status', 'aktif')
    .eq('tipe', 'bank')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return null
  return data ? String((data as { id: string }).id) : null
}

/** Tarif metode dari tabel metode_bayar; kalau belum ada, pakai tarif bawaan. */
export async function ambilTarifMetode(
  admin: SupabaseClient | null,
  kodeMetode: string
): Promise<TarifMetode> {
  if (admin && kodeMetode) {
    const { data, error } = await admin
      .from('metode_bayar')
      .select('*')
      .eq('kode', kodeMetode)
      .maybeSingle()
    if (!error && data) return tarifDariBaris(data as Record<string, unknown>)
  }
  return tarifBawaan(kodeMetode)
}

/** Daftar metode aktif untuk halaman checkout (server-side). */
export async function ambilMetodeAktif(admin: SupabaseClient | null): Promise<TarifMetode[]> {
  if (!admin) return [tarifBawaan('transfer_manual')]
  const { data, error } = await admin
    .from('metode_bayar')
    .select('*')
    .eq('aktif', true)
    .order('urutan', { ascending: true })

  if (error || !data || data.length === 0) return [tarifBawaan('transfer_manual')]
  return data.map((baris) => tarifDariBaris(baris as Record<string, unknown>))
}

export type OpsiCatatPembayaran = {
  operatorId?: string | null
  metodeKode: string
  /** Tiket yang dicakup satu tagihan (boleh lebih dari satu). */
  pesananIds: string[]
  /**
   * Kapal pemilik tiket. WAJIB untuk penjualan online: inilah wadah transaksi
   * yang menentukan closing & laporan. Snapshot kode/nama kapal disimpan.
   */
  kapalId?: string | null
  jadwalId?: string | null
  kodeKapal?: string | null
  namaKapal?: string | null
  /** Nama PT pemilik (profiles.nama_perusahaan); kalau kosong diisi trigger. */
  namaPt?: string | null
  /** Hak pemilik + fee platform untuk SEMUA tiket di tagihan ini. */
  dasar: number
  /** Pembagian dana; jumlahnya WAJIB sama dengan `dasar`. */
  penerima: PenerimaDana[]
  deskripsi: string
  expiredMenit?: number
  metadata?: Record<string, unknown>
}

export type HasilCatatPembayaran = {
  id: string
  kodeBayar: string
  total: number
  biayaLayanan: number
  instruksi: string | null
  tagihan: Tagihan
}

/**
 * Buat tagihan + baris pembagian dana. TIDAK menandai tiket lunas: tiket tetap
 * pending sampai pembayaran diverifikasi (webhook gateway atau admin).
 */
export async function catatPembayaran(
  admin: SupabaseClient,
  opsi: OpsiCatatPembayaran
): Promise<HasilCatatPembayaran> {
  const tarif = await ambilTarifMetode(admin, opsi.metodeKode)
  const rincian = rincianTagihan(opsi.dasar, tarif)
  const jumlahTiket = Math.max(1, opsi.pesananIds.length)

  const totalPenerima = opsi.penerima.reduce((total, p) => total + Math.max(0, Math.round(p.nominal)), 0)
  if (totalPenerima !== rincian.dasar) {
    throw new Error(
      `Pembagian dana (${totalPenerima.toLocaleString('id-ID')}) tidak sama dengan dasar tagihan ` +
        `(${rincian.dasar.toLocaleString('id-ID')}). Periksa fee platform / fee agen.`
    )
  }

  const provider = ambilPaymentProvider()
  // Awalan kode bayar = kode kapal, jadi dana tidak mungkin "nyasar" tanpa
  // jejak: dari mutasi bank langsung kelihatan kapal pemiliknya.
  const kodeBayar = await kodeBayarBebas(admin, opsi.kodeKapal || opsi.namaKapal)
  const expiredMenit = Math.max(5, opsi.expiredMenit || 60)
  const expiredAt = new Date(Date.now() + expiredMenit * 60 * 1000).toISOString()

  const tagihan = await provider.buatTagihan({
    kodeBayar,
    operatorId: opsi.operatorId || null,
    kapalId: opsi.kapalId || null,
    kodeKapal: opsi.kodeKapal || null,
    namaKapal: opsi.namaKapal || null,
    namaPt: opsi.namaPt || null,
    metodeKode: opsi.metodeKode,
    jumlahTiket,
    dasar: rincian.dasar,
    biayaLayanan: rincian.biayaLayanan,
    total: rincian.total,
    penerima: opsi.penerima,
    deskripsi: opsi.deskripsi,
    expiredAt,
    metadata: opsi.metadata,
  })

  const { data: pembayaran, error } = await admin
    .from('tagihan')
    .insert({
      operator_id: opsi.operatorId || null,
      kode_bayar: kodeBayar,
      // Wadah transaksi: kapal + jadwal + snapshot nama (tidak bisa tercampur,
      // trigger DB menolak kalau kapal bukan milik PT di operator_id).
      kapal_id: opsi.kapalId || null,
      jadwal_id: opsi.jadwalId || null,
      kode_kapal: opsi.kodeKapal || null,
      nama_kapal: opsi.namaKapal || null,
      nama_pt: opsi.namaPt || null,
      pg_provider: provider.kode,
      pg_mode: (process.env.PAYMENT_MODE || 'sandbox').trim().toLowerCase(),
      metode_kode: opsi.metodeKode,
      jumlah_tiket: jumlahTiket,
      dasar: rincian.dasar,
      biaya_layanan: rincian.biayaLayanan,
      total_tagih: tagihan.total || rincian.total,
      mdr_estimasi: rincian.mdrEstimasi,
      status: 'pending',
      pg_ref: tagihan.pgRef || null,
      pg_payload: (tagihan.raw ?? null) as never,
      instruksi: tagihan.instruksi || null,
      expired_at: expiredAt,
    })
    .select('*')
    .single()

  if (error || !pembayaran) {
    throw new Error(`Gagal menyimpan tagihan: ${error?.message || 'data kosong'}`)
  }

  const metodeKirim = provider.otomatis ? 'disbursement' : 'transfer_manual'
  const barisSplit: Array<Record<string, unknown>> = []
  for (const p of opsi.penerima) {
    const nominal = Math.round(p.nominal)
    if (nominal <= 0) continue
    barisSplit.push({
      tagihan_id: pembayaran.id,
      penerima_tipe: p.tipe,
      penerima_id: p.id || null,
      nama_penerima: p.nama || null,
      nominal,
      status: 'menunggu',
      metode_kirim: metodeKirim,
      // Pemilik: tunjuk rekening aktif PT-nya sekarang, jadi saat closing
      // tidak ada lagi pencarian manual yang bisa salah rekening.
      rekening_id: p.tipe === 'pemilik' ? await rekeningAktifPemilik(admin, p.id) : null,
    })
  }

  if (barisSplit.length > 0) {
    const { error: errSplit } = await admin.from('tagihan_split').insert(barisSplit)
    if (errSplit) throw new Error(`Gagal menyimpan pembagian dana: ${errSplit.message}`)
  }

  if (opsi.pesananIds.length > 0) {
    const totalPerTiket = Math.round((tagihan.total || rincian.total) / jumlahTiket)
    const biayaPerTiket = Math.round(rincian.biayaLayanan / jumlahTiket)
    await admin
      .from('pesanan')
      .update({
        tagihan_id: pembayaran.id,
        total_bayar: totalPerTiket,
        biaya_layanan: biayaPerTiket,
      })
      .in('id', opsi.pesananIds)
  }

  return {
    id: pembayaran.id,
    kodeBayar,
    total: tagihan.total || rincian.total,
    biayaLayanan: rincian.biayaLayanan,
    instruksi: tagihan.instruksi || null,
    tagihan,
  }
}

/**
 * Tandai tagihan lunas (dipanggil webhook gateway atau admin untuk mode
 * manual). Dana pemilik berstatus 'ditahan' sampai dicairkan.
 */
export async function tandaiLunas(
  admin: SupabaseClient,
  kodeBayar: string,
  opsi?: { mdrAktual?: number | null; pgRef?: string | null; paidAt?: string | null }
): Promise<Record<string, unknown>> {
  const { data: pembayaran, error } = await admin
    .from('tagihan')
    .select('*')
    .eq('kode_bayar', kodeBayar)
    .maybeSingle()

  if (error || !pembayaran) throw new Error(`Tagihan ${kodeBayar} tidak ditemukan.`)
  if (pembayaran.status === 'paid') return pembayaran as Record<string, unknown>

  const { data: diperbarui, error: errUpdate } = await admin
    .from('tagihan')
    .update({
      status: 'paid',
      paid_at: opsi?.paidAt || new Date().toISOString(),
      mdr_aktual: opsi?.mdrAktual ?? pembayaran.mdr_estimasi ?? null,
      pg_ref: opsi?.pgRef || pembayaran.pg_ref || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pembayaran.id)
    .select('*')
    .single()

  if (errUpdate || !diperbarui) {
    throw new Error(`Gagal menandai lunas: ${errUpdate?.message || 'data kosong'}`)
  }

  await admin
    .from('tagihan_split')
    .update({ status: 'ditahan' })
    .eq('tagihan_id', pembayaran.id)
    .eq('status', 'menunggu')

  return diperbarui as Record<string, unknown>
}

/** Cairkan satu baris pembagian dana lewat adapter payout. */
export async function cairkanSplit(
  admin: SupabaseClient,
  splitId: string,
  rekening: RekeningTujuan,
  metodeKirim = 'transfer_manual'
): Promise<{ status: string; pesan?: string | null; pgRef?: string | null }> {
  const { data: split, error } = await admin
    .from('tagihan_split')
    .select('*')
    .eq('id', splitId)
    .maybeSingle()

  if (error || !split) throw new Error('Baris pembagian dana tidak ditemukan.')
  if (['selesai', 'dibatalkan'].includes(String(split.status))) {
    throw new Error(`Pembagian dana sudah ${split.status}, tidak bisa dicairkan lagi.`)
  }

  const provider = ambilPayoutProvider()
  const hasil = await provider.kirimDana({
    referensi: String(split.id),
    nominal: Number(split.nominal || 0),
    rekening,
    catatan: split.catatan || null,
  })

  const status =
    hasil.status === 'selesai' ? 'selesai' : hasil.status === 'gagal' ? 'gagal' : 'dikirim'
  const sekarang = new Date().toISOString()

  await admin
    .from('tagihan_split')
    .update({
      status,
      metode_kirim: metodeKirim,
      pg_ref: hasil.pgRef || null,
      dikirim_at: sekarang,
      selesai_at: status === 'selesai' ? sekarang : null,
      catatan: hasil.pesan || split.catatan || null,
    })
    .eq('id', split.id)

  return { status, pesan: hasil.pesan || null, pgRef: hasil.pgRef || null }
}
