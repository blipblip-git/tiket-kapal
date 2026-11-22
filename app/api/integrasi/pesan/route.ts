// app/api/integrasi/pesan/route.ts
// API integrasi tenant: membuat pesanan tiket dari sistem milik tenant sendiri
// (website/POS tenant). Wajib header x-api-key; jadwal harus milik tenant itu.
//
// Body:
// {
//   "jadwal_id": "uuid",
//   "kursi_ids": ["uuid", ...],
//   "penumpang": [{ "nama": "...", "nik": "16 digit", "balita": ["nama"] }],
//   "nomor_hp": "08...",
//   "sudah_dibayar": true|false   // true kalau tenant sudah menerima uang
// }
//
// Aturan tetap dipegang platform: harga dari database (bukan dari tenant),
// kanal 'online' (kena fee platform), NIK disamarkan, tiket belum bayar
// kedaluwarsa 15 menit.

import { NextResponse } from 'next/server'
import { wajibApiKey, catatIntegrasi, jadwalMilikTenant } from '@/lib/integrasiAuth'
import { kunciKursi, lepasKunciKursi, lepasKunciKedaluwarsa } from '@/lib/segmen'

const MAKS_PENUMPANG = 8

const toTitleCase = (str: string) =>
  str
    .toLowerCase()
    .split(' ')
    .map((kata) => (kata ? kata.charAt(0).toUpperCase() + kata.slice(1) : kata))
    .join(' ')

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
  const auth = await wajibApiKey(request, 'integrasi-pesan', 40)
  if (!auth.ok) return auth.response

  const { admin, klien } = auth

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Format permintaan tidak valid.' }, { status: 400 })
  }

  const jadwalId = String(body.jadwal_id || '').trim()
  const kursiIds: string[] = Array.isArray(body.kursi_ids) ? body.kursi_ids.map((x: any) => String(x)) : []
  const penumpang: any[] = Array.isArray(body.penumpang) ? body.penumpang : []
  const nomorHp = String(body.nomor_hp || '').replace(/\D/g, '')
  const sudahDibayar = body.sudah_dibayar === true

  if (!/^[0-9a-f-]{36}$/i.test(jadwalId)) {
    return NextResponse.json({ error: 'Jadwal tidak valid.' }, { status: 400 })
  }
  if (kursiIds.length === 0 || kursiIds.length !== penumpang.length) {
    return NextResponse.json({ error: 'Jumlah kursi dan penumpang tidak cocok.' }, { status: 400 })
  }
  if (penumpang.length > MAKS_PENUMPANG) {
    return NextResponse.json({ error: `Maksimal ${MAKS_PENUMPANG} penumpang per transaksi.` }, { status: 400 })
  }
  if (new Set(kursiIds).size !== kursiIds.length) {
    return NextResponse.json({ error: 'Kursi yang dipilih tidak boleh dobel.' }, { status: 400 })
  }
  if (nomorHp.length < 8 || nomorHp.length > 20) {
    return NextResponse.json({ error: 'Nomor HP tidak valid.' }, { status: 400 })
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
    const { jadwal, error: errJadwal } = await jadwalMilikTenant(admin, jadwalId, klien.operator_id)
    if (!jadwal) return NextResponse.json({ error: errJadwal || 'Jadwal tidak ditemukan.' }, { status: 404 })

    const statusJadwal = String(jadwal.status_jadwal || '').toLowerCase()
    const statusUmum = String(jadwal.status || '').toLowerCase()
    if (['berangkat', 'batal', 'dibatalkan'].includes(statusJadwal) || ['nonaktif', 'batal'].includes(statusUmum)) {
      return NextResponse.json({ error: 'Jadwal ini sudah ditutup.' }, { status: 400 })
    }

    const { data: kursiData, error: errKursi } = await admin
      .from('kursi')
      .select('id, jadwal_id, status, nomor_kursi')
      .in('id', kursiIds)

    if (errKursi) throw new Error('Gagal memeriksa kursi: ' + errKursi.message)
    if (!kursiData || kursiData.length !== kursiIds.length) {
      return NextResponse.json({ error: 'Sebagian kursi tidak ditemukan.' }, { status: 400 })
    }

    for (const k of kursiData as any[]) {
      if (k.jadwal_id !== jadwalId) {
        return NextResponse.json({ error: 'Kursi bukan milik jadwal ini.' }, { status: 400 })
      }
      if (k.status && k.status !== 'kosong') {
        return NextResponse.json({ error: 'Ada kursi yang sudah terisi. Muat ulang daftar kursi.' }, { status: 409 })
      }
    }

    const harga = Math.max(0, Math.round(Number(jadwal.harga || 0)))
    const sekarang = new Date()
    const waktuExpired = new Date(sekarang.getTime() + 15 * 60 * 1000).toISOString()
    const grupId = crypto.randomUUID()
    // Nomor kursi untuk penguncian per potongan jalan.
    const nomorKursiDari = new Map<string, string>()
    for (const k of kursiData as any[]) nomorKursiDari.set(String(k.id), String(k.nomor_kursi ?? ''))
    const daftarKunci: { nomor_kursi: string; pesanan_id: string }[] = []
    const rows: any[] = []
    const ringkas: any[] = []
    const idDewasa: string[] = []

    dataPenumpang.forEach((p, idx) => {
      const kursiId = kursiIds[idx]
      const indukId = crypto.randomUUID()
      const kode = kodeAcak('TKT')
      idDewasa.push(indukId)

      rows.push({
        id: indukId,
        jadwal_id: jadwalId,
        kursi_id: kursiId,
        nama_penumpang: p.nama,
        nik: p.nik,
        nomor_hp: nomorHp,
        kanal: 'online',
        status: sudahDibayar ? 'paid' : 'pending',
        waktu_bayar: sudahDibayar ? sekarang.toISOString() : null,
        kode_tiket: kode,
        grup_transaksi_id: grupId,
        waktu_pesan: sekarang.toISOString(),
        waktu_expired: waktuExpired,
        is_balita: false,
        induk_id: null
      })
      ringkas.push({ id: indukId, kode_tiket: kode, nama_penumpang: p.nama, is_balita: false })
      daftarKunci.push({
        nomor_kursi: nomorKursiDari.get(String(kursiId)) || '',
        pesanan_id: indukId
      })

      p.balita.forEach((namaBalita, bIdx) => {
        const idBalita = crypto.randomUUID()
        const kodeBalita = `${kodeAcak('BALITA')}-B${bIdx}`

        rows.push({
          id: idBalita,
          jadwal_id: jadwalId,
          kursi_id: null,
          nama_penumpang: toTitleCase(namaBalita),
          nik: null,
          nomor_hp: nomorHp,
          kanal: 'online',
          status: sudahDibayar ? 'paid' : 'pending',
          waktu_bayar: sudahDibayar ? sekarang.toISOString() : null,
          kode_tiket: kodeBalita,
          grup_transaksi_id: grupId,
          waktu_pesan: sekarang.toISOString(),
          waktu_expired: waktuExpired,
          is_balita: true,
          induk_id: indukId
        })
        ringkas.push({ id: idBalita, kode_tiket: kodeBalita, nama_penumpang: toTitleCase(namaBalita), is_balita: true })
      })
    })

    // Kunci kursi per potongan jalan SEBELUM pesanan disimpan.
    await lepasKunciKedaluwarsa(admin)
    const kunci = await kunciKursi(admin, {
      jadwal: {
        kapal_id: String(jadwal.kapal_id || ''),
        tanggal: String(jadwal.tanggal || ''),
        jam_berangkat: String(jadwal.jam_berangkat || ''),
        rute_asal: String(jadwal.rute_asal || ''),
        rute_tujuan: String(jadwal.rute_tujuan || '')
      },
      kanal: 'online',
      daftar: daftarKunci
    })

    if (!kunci.ok) {
      return NextResponse.json({ error: kunci.pesan }, { status: 409 })
    }

    const { error: errInsert } = await admin.from('pesanan').insert(rows)
    if (errInsert) {
      await lepasKunciKursi(admin, daftarKunci.map((d) => d.pesanan_id))
      throw new Error('Gagal menyimpan pesanan: ' + errInsert.message)
    }

    if (sudahDibayar) {
      await admin.from('kursi').update({ status: 'terisi', waktu_hold: null }).in('id', kursiIds)

      if (harga > 0) {
        const { error: errBayar } = await admin.from('pembayaran').insert(
          idDewasa.map((pesananId) => ({
            pesanan_id: pesananId,
            metode: 'integrasi_api',
            jumlah: harga,
            status: 'sukses',
            waktu_bayar: sekarang.toISOString()
          }))
        )
        if (errBayar) console.error('API integrasi pembayaran:', errBayar.message)
      }
    }

    catatIntegrasi('integrasi-pesan', klien)

    return NextResponse.json({
      success: true,
      grup_transaksi_id: grupId,
      status: sudahDibayar ? 'paid' : 'pending',
      total_harga: harga * dataPenumpang.length,
      waktu_expired: sudahDibayar ? null : waktuExpired,
      jadwal: {
        id: jadwal.id,
        tanggal: jadwal.tanggal,
        jam_berangkat: jadwal.jam_berangkat,
        rute_asal: jadwal.rute_asal,
        rute_tujuan: jadwal.rute_tujuan,
        harga
      },
      tiket: ringkas
    })
  } catch (err: any) {
    console.error('API integrasi pesan:', err)
    const pesan = String(err?.message || 'Gagal memproses pesanan.')
    const status = /tidak valid|harus 16 digit|tidak cocok|tidak ditemukan|sudah terisi|sudah ditutup|bukan milik|terlalu banyak|dobel/i.test(pesan)
      ? 400
      : 500
    return NextResponse.json({ error: pesan }, { status })
  }
}
