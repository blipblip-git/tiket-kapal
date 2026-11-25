// app/api/publik/pesan/route.ts
// Pembuatan pesanan ONLINE diproses di server.
// Pengunjung (anon) tidak lagi punya hak INSERT ke tabel pesanan, jadi harga,
// kanal, kode tiket, dan fee ditentukan server (tidak bisa diakali).

import { NextResponse } from 'next/server'
import { buatClientAdmin, pesanServiceKeyKosong } from '@/lib/serverAuth'
import { catatPermintaan, kenaBatas, kunciIp } from '@/lib/rateLimit'
import { asalDiizinkan } from '@/lib/publikGuard'
import { kunciKursi, lepasKunciKursi, lepasKunciKedaluwarsa, nomorKursiTerpakai } from '@/lib/segmen'
import { varianNomorHp } from '@/lib/nomorHp'

const BATAS = 20
const JENDELA = 10 * 60 * 1000
const MAKS_PENUMPANG = 8

// Batas tiket yang masih `pending` untuk satu nomor HP.
// Kursi online langsung dikunci 15 menit walau belum dibayar; tanpa batas ini
// satu orang bisa memesan berkali-kali dengan nama/NIK apa saja lalu menahan
// hampir semua kursi sampai jadwal berangkat. Hitungan memakai database (bukan
// memori proses) supaya tetap berlaku walau request jatuh ke instance lain.
const BATAS_PENDING_PER_HP = Math.max(1, Number(process.env.BATAS_PENDING_PER_HP) || 10)

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
  const tolakAsal = asalDiizinkan(request)
  if (tolakAsal) return tolakAsal

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
    // Batas pesanan pending per nomor HP (anti penguncian kursi).
    // Dicek SEBELUM menyentuh jadwal/kursi supaya permintaan yang melanggar
    // tidak membebani query lain dan tidak pernah sampai mengunci kursi.
    const jumlahTiketBaru = dataPenumpang.reduce((n, p) => n + 1 + p.balita.length, 0)
    const { count: jumlahPending, error: errPending } = await admin
      .from('pesanan')
      .select('id', { count: 'exact', head: true })
      .in('nomor_hp', varianNomorHp(nomorHp))
      .eq('status', 'pending')
      .gt('waktu_expired', new Date().toISOString())

    if (errPending) throw new Error('Gagal memeriksa pesanan yang belum dibayar: ' + errPending.message)

    const pendingSekarang = jumlahPending || 0
    if (pendingSekarang + jumlahTiketBaru > BATAS_PENDING_PER_HP) {
      return NextResponse.json(
        {
          error:
            `Nomor HP ini masih punya ${pendingSekarang} tiket yang belum dibayar. ` +
            `Selesaikan pembayaran atau tunggu 15 menit sampai pesanan kedaluwarsa ` +
            `(maksimal ${BATAS_PENDING_PER_HP} tiket pending per nomor HP).`
        },
        { status: 429 }
      )
    }

    const { data: jadwal, error: errJadwal } = await admin
      .from('jadwal')
      .select('id, harga, tanggal, status, status_jadwal, kapal_id, jam_berangkat, rute_asal, rute_tujuan')
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
      .select('id, jadwal_id, status, nomor_kursi')
      .in('id', kursiIds)

    if (errKursi) throw new Error('Gagal memeriksa kursi: ' + errKursi.message)
    if (!kursiData || kursiData.length !== kursiIds.length) throw new Error('Sebagian kursi tidak ditemukan.')

    // Ketersediaan dicek PER POTONGAN JALAN. Kalau tabel kursi_pakai aktif,
    // kursi yang dipakai penumpang rute lain pada keberangkatan yang sama tetap
    // boleh dijual asal intervalnya tidak beririsan. Constraint DB jadi penjaga akhir.
    const segmen = await nomorKursiTerpakai(admin, {
      kapal_id: String((jadwal as any).kapal_id || ''),
      tanggal: String((jadwal as any).tanggal || ''),
      jam_berangkat: String((jadwal as any).jam_berangkat || ''),
      rute_asal: String((jadwal as any).rute_asal || ''),
      rute_tujuan: String((jadwal as any).rute_tujuan || ''),
    })

    for (const k of kursiData as any[]) {
      if (k.jadwal_id !== jadwalId) throw new Error('Kursi bukan milik jadwal ini.')
      const nomor = String(k.nomor_kursi ?? '')
      const terpakai = segmen.aktif ? segmen.nomor.has(nomor) : Boolean(k.status && k.status !== 'kosong')
      if (terpakai) throw new Error('Kursi sudah terisi, silakan pilih kursi lain.')
    }

    // Nomor kursi (1..N) untuk penguncian per potongan jalan.
    const nomorKursiDari = new Map<string, string>()
    for (const k of kursiData as any[]) nomorKursiDari.set(String(k.id), String(k.nomor_kursi ?? ''))

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
    const daftarKunci: { nomor_kursi: string; pesanan_id: string }[] = []

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

      daftarKunci.push({
        nomor_kursi: nomorKursiDari.get(String(kursiId)) || '',
        pesanan_id: indukId,
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

    // Kunci kursi per potongan jalan SEBELUM pesanan disimpan.
    // Online: kursi langsung terkunci walau belum dibayar (expired → dilepas otomatis).
    await lepasKunciKedaluwarsa(admin)
    const hasilKunci = await kunciKursi(admin, {
      jadwal: {
        kapal_id: String((jadwal as any).kapal_id || ''),
        tanggal: String((jadwal as any).tanggal || ''),
        jam_berangkat: String((jadwal as any).jam_berangkat || ''),
        rute_asal: String((jadwal as any).rute_asal || ''),
        rute_tujuan: String((jadwal as any).rute_tujuan || ''),
      },
      kanal: 'online',
      daftar: daftarKunci,
    })

    if (!hasilKunci.ok) {
      return NextResponse.json({ error: hasilKunci.pesan }, { status: 409 })
    }

    const { data: inserted, error: errInsert } = await admin.from('pesanan').insert(rows).select('id')
    if (errInsert) {
      await lepasKunciKursi(admin, daftarKunci.map((d) => d.pesanan_id))
      throw new Error('Gagal menyimpan pesanan: ' + errInsert.message)
    }

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

