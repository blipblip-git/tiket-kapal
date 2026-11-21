// app/api/integrasi/bayar/route.ts
// API integrasi tenant: konfirmasi pembayaran untuk pesanan yang tadi dibuat
// lewat POST /api/integrasi/pesan dengan `sudah_dibayar:false`.
// Wajib x-api-key; hanya pesanan pada jadwal milik tenant itu.

import { NextResponse } from 'next/server'
import { wajibApiKey, catatIntegrasi, jadwalMilikTenant } from '@/lib/integrasiAuth'

export async function POST(request: Request) {
  const auth = await wajibApiKey(request, 'integrasi-bayar', 60)
  if (!auth.ok) return auth.response

  const { admin, klien } = auth

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Format permintaan tidak valid.' }, { status: 400 })
  }

  const ids: string[] = [...new Set(
    (Array.isArray(body?.ids) ? body.ids : [])
      .map((x: any) => String(x))
      .filter((x: string) => /^[0-9a-f-]{36}$/i.test(x))
  )] as string[]

  if (ids.length === 0 || ids.length > 20) {
    return NextResponse.json({ error: 'Daftar pesanan tidak valid.' }, { status: 400 })
  }

  try {
    const { data: rows, error: errRows } = await admin
      .from('pesanan')
      .select('id, status, waktu_expired, jadwal_id, kursi_id, is_balita')
      .in('id', ids)

    if (errRows) throw new Error('Gagal membaca pesanan: ' + errRows.message)
    const semua = (rows || []) as any[]
    if (semua.length !== ids.length) {
      return NextResponse.json({ error: 'Sebagian pesanan tidak ditemukan.' }, { status: 404 })
    }

    // Kepemilikan: semua pesanan harus di jadwal yang sama dan milik tenant ini.
    const jadwalIds = [...new Set(semua.map((r) => r.jadwal_id))]
    if (jadwalIds.length !== 1) {
      return NextResponse.json({ error: 'Semua pesanan harus dari satu jadwal.' }, { status: 400 })
    }

    const { jadwal, error: errJadwal } = await jadwalMilikTenant(admin, jadwalIds[0], klien.operator_id)
    if (!jadwal) return NextResponse.json({ error: errJadwal || 'Jadwal tidak ditemukan.' }, { status: 403 })

    if (semua.some((r) => r.status === 'refund' || r.status === 'batal')) {
      return NextResponse.json({ error: 'Pesanan sudah dibatalkan/direfund.' }, { status: 400 })
    }

    const belumBayar = semua.filter((r) => r.status !== 'paid')
    if (belumBayar.length === 0) {
      catatIntegrasi('integrasi-bayar', klien)
      return NextResponse.json({ success: true, sudah_lunas: true, ids })
    }

    if (belumBayar.some((r) => r.waktu_expired && new Date(r.waktu_expired).getTime() < Date.now())) {
      return NextResponse.json({ error: 'Waktu pembayaran sudah habis. Buat pesanan baru.' }, { status: 400 })
    }

    const harga = Math.max(0, Math.round(Number(jadwal.harga || 0)))
    const waktuBayar = new Date().toISOString()

    const { error: errUpdate } = await admin
      .from('pesanan')
      .update({ status: 'paid', waktu_bayar: waktuBayar })
      .in('id', belumBayar.map((r) => r.id))
    if (errUpdate) throw new Error('Gagal menandai pembayaran: ' + errUpdate.message)

    const kursiIds = [...new Set(
      belumBayar.filter((r) => !r.is_balita && r.kursi_id).map((r) => r.kursi_id)
    )] as string[]

    if (kursiIds.length > 0) {
      await admin.from('kursi').update({ status: 'terisi', waktu_hold: null }).in('id', kursiIds)
    }

    const dewasa = belumBayar.filter((r) => !r.is_balita)
    if (dewasa.length > 0 && harga > 0) {
      const { error: errBayar } = await admin.from('pembayaran').insert(
        dewasa.map((r) => ({
          pesanan_id: r.id,
          metode: 'integrasi_api',
          jumlah: harga,
          status: 'sukses',
          waktu_bayar: waktuBayar
        }))
      )
      if (errBayar) console.error('API integrasi konfirmasi bayar:', errBayar.message)
    }

    catatIntegrasi('integrasi-bayar', klien)

    return NextResponse.json({ success: true, sudah_lunas: false, ids, waktu_bayar: waktuBayar })
  } catch (err: any) {
    console.error('API integrasi bayar:', err)
    return NextResponse.json({ error: err?.message || 'Gagal memproses pembayaran.' }, { status: 500 })
  }
}
