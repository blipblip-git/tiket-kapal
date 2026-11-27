// app/api/publik/bayar/route.ts
// Pembayaran ONLINE (mode simulasi) diproses di server supaya pengunjung tidak
// perlu hak tulis ke tabel pesanan / kursi / pembayaran.
//
// Catatan penting: `metode` yang dikirim halaman pembayaran HANYA dicatat sebagai
// pilihan pembeli (kolom `pembayaran.referensi`). Biaya layanan tidak pernah
// dihitung di sini dan tidak mengubah nominal yang dibayar — biaya layanan baru
// ditagihkan lewat tagihan gateway saat provider aktif (lihat lib/payment).

import { NextResponse } from 'next/server'
import { buatClientAdmin, pesanServiceKeyKosong } from '@/lib/serverAuth'
import { catatPermintaan, kenaBatas, kunciIp } from '@/lib/rateLimit'
import { asalDiizinkan } from '@/lib/publikGuard'

const BATAS = 30
const JENDELA = 10 * 60 * 1000

function ambilIds(body: any): string[] {
  const ids = Array.isArray(body?.ids) ? body.ids : []
  return [...new Set(ids.map((x: any) => String(x)).filter((x: string) => /^[0-9a-f-]{36}$/i.test(x)))] as string[]
}

/** Kode kanal pilihan pembeli — hanya untuk catatan, bukan penentu harga. */
function ambilMetode(body: any): string | null {
  const kode = typeof body?.metode === 'string' ? body.metode.trim().toLowerCase() : ''
  return /^[a-z0-9_]{2,40}$/.test(kode) ? kode : null
}

export async function POST(request: Request) {
  const tolakAsal = asalDiizinkan(request)
  if (tolakAsal) return tolakAsal

  const admin = buatClientAdmin()
  if (!admin) return pesanServiceKeyKosong()

  const kunci = kunciIp(request, 'publik-bayar')
  if (kenaBatas(kunci, BATAS, JENDELA)) {
    return NextResponse.json({ error: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' }, { status: 429 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Format permintaan tidak valid.' }, { status: 400 })
  }

  const ids = ambilIds(body)
  const metodePilihan = ambilMetode(body)
  if (ids.length === 0 || ids.length > 20) {
    return NextResponse.json({ error: 'Daftar pesanan tidak valid.' }, { status: 400 })
  }

  const { data: rows, error: errRows } = await admin
    .from('pesanan')
    .select('id, status, waktu_expired, jadwal_id, kursi_id, is_balita, kanal')
    .in('id', ids)

  if (errRows) {
    return NextResponse.json({ error: 'Gagal membaca pesanan: ' + errRows.message }, { status: 500 })
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'Pesanan tidak ditemukan.' }, { status: 404 })
  }
  if (rows.some((r: any) => r.status === 'refund')) {
    return NextResponse.json({ error: 'Pesanan ini sudah direfund.' }, { status: 400 })
  }

  const belumBayar = (rows as any[]).filter((r) => r.status !== 'paid')
  const waktuBayar = new Date().toISOString()

  if (belumBayar.length > 0) {
    const kedaluwarsa = belumBayar.find(
      (r) => r.waktu_expired && new Date(r.waktu_expired).getTime() < Date.now()
    )
    if (kedaluwarsa) {
      return NextResponse.json(
        { error: 'Waktu pembayaran sudah habis. Silakan pesan tiket lagi.' },
        { status: 400 }
      )
    }
  }

  const jadwalId = (rows as any[])[0].jadwal_id
  const { data: jadwal } = await admin.from('jadwal').select('harga').eq('id', jadwalId).maybeSingle()
  const harga = Math.max(0, Math.round(Number((jadwal as any)?.harga || 0)))

  if (belumBayar.length > 0) {
    const { error: errUpdate } = await admin
      .from('pesanan')
      .update({ status: 'paid', waktu_bayar: waktuBayar, kanal: 'online' })
      .in('id', belumBayar.map((r) => r.id))

    if (errUpdate) {
      return NextResponse.json({ error: 'Gagal menandai pembayaran: ' + errUpdate.message }, { status: 500 })
    }
  }

  const kursiIds = [
    ...new Set(
      (rows as any[])
        .filter((r) => !r.is_balita && r.kursi_id)
        .map((r) => r.kursi_id)
    )
  ] as string[]

  if (kursiIds.length > 0) {
    const { error: errKursi } = await admin
      .from('kursi')
      .update({ status: 'terisi', waktu_hold: null })
      .in('id', kursiIds)

    // Kolom waktu_hold mungkin belum ada di database lama — coba tanpa kolom itu.
    if (errKursi && /waktu_hold/i.test(errKursi.message || '')) {
      await admin.from('kursi').update({ status: 'terisi' }).in('id', kursiIds)
    }
  }

  if (belumBayar.length > 0 && harga > 0) {
    const dewasa = belumBayar.filter((r) => !r.is_balita)
    if (dewasa.length > 0) {
      const { error: errBayar } = await admin.from('pembayaran').insert(
        dewasa.map((r) => ({
          pesanan_id: r.id,
          metode: 'simulasi_online',
          jumlah: harga,
          status: 'sukses',
          // Hanya jejak pilihan pembeli (mis. "kanal:qris"). Tidak memengaruhi
          // nominal: biaya layanan tidak ditagihkan di mode simulasi.
          referensi: metodePilihan ? `kanal:${metodePilihan}` : null,
          waktu_bayar: waktuBayar
        }))
      )
      if (errBayar && !/does not exist|column/i.test(errBayar.message || '')) {
        console.error('Gagal simpan pembayaran:', errBayar.message)
      }
    }
  }

  catatPermintaan(kunci, JENDELA)
  return NextResponse.json({ success: true, ids })
}
