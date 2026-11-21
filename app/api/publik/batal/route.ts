// app/api/publik/batal/route.ts
// Membatalkan pesanan ONLINE yang BELUM dibayar + mengosongkan kursinya.
// Pesanan yang sudah dibayar tidak boleh dihapus (harus lewat menu Refund).

import { NextResponse } from 'next/server'
import { buatClientAdmin, pesanServiceKeyKosong } from '@/lib/serverAuth'
import { catatPermintaan, kenaBatas, kunciIp } from '@/lib/rateLimit'
import { asalDiizinkan } from '@/lib/publikGuard'

const BATAS = 30
const JENDELA = 10 * 60 * 1000

export async function POST(request: Request) {
  const tolakAsal = asalDiizinkan(request)
  if (tolakAsal) return tolakAsal

  const admin = buatClientAdmin()
  if (!admin) return pesanServiceKeyKosong()

  const kunci = kunciIp(request, 'publik-batal')
  if (kenaBatas(kunci, BATAS, JENDELA)) {
    return NextResponse.json({ error: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' }, { status: 429 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Format permintaan tidak valid.' }, { status: 400 })
  }

  const ids = [...new Set(
    (Array.isArray(body?.ids) ? body.ids : [])
      .map((x: any) => String(x))
      .filter((x: string) => /^[0-9a-f-]{36}$/i.test(x))
  )] as string[]

  if (ids.length === 0 || ids.length > 20) {
    return NextResponse.json({ error: 'Daftar pesanan tidak valid.' }, { status: 400 })
  }

  const { data: rows, error: errRows } = await admin
    .from('pesanan')
    .select('id, status, kursi_id, is_balita')
    .in('id', ids)

  if (errRows) {
    return NextResponse.json({ error: 'Gagal membaca pesanan: ' + errRows.message }, { status: 500 })
  }

  const semua = (rows || []) as any[]
  if (semua.some((r) => r.status === 'paid')) {
    return NextResponse.json(
      { error: 'Pesanan sudah dibayar. Hubungi petugas untuk proses refund.' },
      { status: 400 }
    )
  }

  const kursiIds = [...new Set(semua.filter((r) => !r.is_balita && r.kursi_id).map((r) => r.kursi_id))] as string[]

  const { error: errHapus } = await admin.from('pesanan').delete().in('id', semua.map((r) => r.id))
  if (errHapus) {
    return NextResponse.json({ error: 'Gagal membatalkan pesanan: ' + errHapus.message }, { status: 500 })
  }

  if (kursiIds.length > 0) {
    const { error: errKursi } = await admin
      .from('kursi')
      .update({ status: 'kosong', waktu_hold: null })
      .in('id', kursiIds)
    if (errKursi && /waktu_hold/i.test(errKursi.message || '')) {
      await admin.from('kursi').update({ status: 'kosong' }).in('id', kursiIds)
    }
  }

  catatPermintaan(kunci, JENDELA)
  return NextResponse.json({ success: true })
}
