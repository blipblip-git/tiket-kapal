// app/api/publik/pesan/route.ts
// Pembuatan pesanan ONLINE diproses di server.
// Pengunjung (anon) tidak lagi punya hak INSERT ke tabel pesanan, jadi harga,
// kanal, kode tiket, dan fee ditentukan server (tidak bisa diakali).

import { NextResponse } from 'next/server'
import { buatClientAdmin, pesanServiceKeyKosong } from '@/lib/serverAuth'
import { catatPermintaan, kenaBatas, kunciIp } from '@/lib/rateLimit'

const BATAS = 20
const JENDELA = 10 * 60 * 1000
const MAKS_PENUMPANG = 8

type PenumpangMasuk = { nama?: unknown; nik?: unknown; balita?: unknown }

const toTitleCase = (str: string) =>
  str
    .toLowerCase()
    .split(' ')
    .map((kata) => (kata ? kata.charAt(0).toUpperCase() + kata.slice(1) : kata))
    .join(' ')

// NIK disimpan tersamar seperti alur lama (hanya 4 digit terakhir).
const maskNik = (nik: string) => {
  const bersih = String(nik || '').replace(/\D/g, '')
  if (bersih.length !== 16) return bersih
  return `****************${bersih.slice(-4)}`
}

const ALFABET_KODE = 'ABCDEFGHIJKLMNPQRSTUVWXYZ0123456789'

const kodeAcak = (awalan: string) => {
  const buf = new Uint8Array(6)
  crypto.getRandomValues(buf)
  return `${awalan}-${Array.from(buf).map((b) => ALFABET_KODE[b % ALFABET_KODE.length]).join('')}`
}

export async function POST(request: Request) {
  const admin = buatClientAdmin()
  if (!admin) return pesanServiceKeyKosong()

  const kunci = kunciIp(request, 'publik-pesan')
  if (kenaBatas(kunci, BATAS, JENDELA)) {
    return NextResponse.json(
      { error: 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.' },
      { status: 429 }
    )
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Format permintaan tidak valid.' }, { status: 400 })
  }

  const jadwalId = String(body.jadwal_id || '').trim()
  const kursiIds: string[] = Array.isArray(body.kursi_ids) ? body.kursi_ids.map((x: any) => String(x)) : []
  const penumpang: PenumpangMasuk[] = Array.isArray(body.penumpang) ? body.penumpang : []
  const nomorHp = String(body.nomor_hp || '').replace(/\D/g, '')

  if (!/^[0-9a-f-]{36}$/i.test(jadwalId)) {
    return NextResponse.json({ error: 'Jadwal tidak valid.' }, { status: 400 })
  }
  if (kursiIds.length === 0 || kursiIds.length !== penumpang.length) {
    return NextResponse.json({ error: 'Jumlah kursi dan penumpang tidak cocok.' }, { status: 400 })
  }
  if (penumpang.length > MAKS_PENUMPANG) {
    return NextResponse.json({ error: `Maksimal ${MAKS_PENUMPANG} penumpang per transaksi.` }, { status: 400 })
  }
  if (nomorHp.length < 8 || nomorHp.length > 20) {
    return NextResponse.json({ error: 'Nomor HP tidak valid.' }, { status: 400 })
  }
  if (new Set(kursiIds).size !== kursiIds.length) {
    return NextResponse.json({ error: 'Kursi yang dipilih tidak boleh dobel.' }, { status: 400 })
  }

  let dataPenumpang: { nama: string; nik: string; balita: string[] }[]
  try {
    dataPenumpang = penumpang.map((p, i) => {
      const nama = String(p?.nama || '').trim()
      const nik = String(p?.nik || '').replace(/\D/g, '')
      const balita = Array.isArray(p?.balita)
        ? (p.balita as unknown[]).map((b) => String(b || '').trim()).filter(Boolean)
        : []

      if (nama.length < 2 || nama.length > 100) throw new Error(`Nama penumpang #${i + 1} tidak valid.`)
      if (nik.length !== 16) throw new Error(`NIK penumpang #${i + 1} harus 16 digit.`)
      if (balita.length > 4) throw new Error(`Balita penumpang #${i + 1} terlalu banyak.`)

      return { nama: toTitleCase(nama), nik: maskNik(nik), balita }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }

  try {
    const { data: jadwal, error: errJadwal } = await admin
      .from('jadwal')
      .select('id, harga, tanggal, status, status_jadwal')
      .eq('id', jadwalId)
      .maybeSingle()

    if (errJadwal) throw new Error('Gagal memeriksa jadwal: ' + errJadwal.message)
    if (!jadwal) throw new Error('Jadwal tidak ditemukan.')

    const statusJadwal = String((jadwal as any).status_jadwal || '').toLowerCase()
    const statusUmum = String((jadwal as any).status || '').toLowerCase()
    if (['berangkat', 'batal', 'dibatalkan'].includes(statusJadwal) || ['nonaktif', 'batal'].includes(statusUmum)) {
      throw new Error('Jadwal ini sudah ditutup, silakan pilih jadwal lain.')
    }

    const { data: kursiData, error: errKursi } = await admin
      .from('kursi')
      .select('id, jadwal_id, status')
      .in('id', kursiIds)

    if (errKursi) throw new Error('Gagal memeriksa kursi: ' + errKursi.message)
    if (!kursiData || kursiData.length !== kursiIds.length) throw new Error('Sebagian kursi tidak ditemukan.')

    for (const k of kursiData as any[]) {
      if (k.jadwal_id !== jadwalId) throw new Error('Kursi bukan milik jadwal ini.')
      if (k.status && k.status !== 'kosong') throw new Error('Kursi sudah terisi, silakan pilih kursi lain.')
    }

    // Fee platform diambil dari server (kalau tabel/kolom belum ada -> 0).
    let feePlatform = 0
    const { data: platform } = await admin
      .from('pengaturan_platform')
      .select('fee_platform')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    feePlatform = Math.max(0, Math.round(Number((platform as any)?.fee_platform || 0)))

    const { error: errFee } = await admin.from('pesanan').select('fee_platform').limit(1)
    const adaKolomFee = !errFee

    const grupId = crypto.randomUUID()
    const sekarang = new Date()
    const waktuExpired = new Date(sekarang.getTime() + 15 * 60 * 1000).toISOString()
    const rows: any[] = []

    dataPenumpang.forEach((p, idx) => {
      const kursiId = kursiIds[idx]
      const indukId = crypto.randomUUID()

      rows.push({
        id: indukId,
        jadwal_id: jadwalId,
        kursi_id: kursiId,
        nama_penumpang: p.nama,
        nik: p.nik,
        nomor_hp: nomorHp,
        kanal: 'online',
        status: 'pending',
        kode_tiket: kodeAcak('TKT'),
        grup_transaksi_id: grupId,
        waktu_pesan: sekarang.toISOString(),
        waktu_expired: waktuExpired,
        is_balita: false,
        induk_id: null,
        ...(adaKolomFee ? { fee_agen: 0, fee_platform: feePlatform } : {})
      })

      p.balita.forEach((namaBalita, bIdx) => {
        rows.push({
          id: crypto.randomUUID(),
          jadwal_id: jadwalId,
          kursi_id: null,
          nama_penumpang: toTitleCase(namaBalita),
          nik: null,
          nomor_hp: nomorHp,
          kanal: 'online',
          status: 'pending',
          kode_tiket: `${kodeAcak('BALITA')}-B${bIdx}`,
          grup_transaksi_id: grupId,
          waktu_pesan: sekarang.toISOString(),
          waktu_expired: waktuExpired,
          is_balita: true,
          induk_id: indukId,
          ...(adaKolomFee ? { fee_agen: 0, fee_platform: feePlatform } : {})
        })
      })
    })

    const { data: inserted, error: errInsert } = await admin.from('pesanan').insert(rows).select('id')
    if (errInsert) throw new Error('Gagal menyimpan pesanan: ' + errInsert.message)

    catatPermintaan(kunci, JENDELA)

    return NextResponse.json({
      success: true,
      grup_transaksi_id: grupId,
      ids: (inserted || []).map((x: any) => x.id)
    })
  } catch (err: any) {
    if (/tidak valid|harus 16 digit|tidak cocok|tidak ditemukan|sudah terisi|sudah ditutup|bukan milik|terlalu banyak|dobel/i.test(err?.message || '')) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('API publik pesan:', err)
    return NextResponse.json(
      { error: err?.message || 'Terjadi kesalahan saat memproses pesanan.' },
      { status: 500 }
    )
  }
}

