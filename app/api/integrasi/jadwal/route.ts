// app/api/integrasi/jadwal/route.ts
// API integrasi tenant: daftar jadwal milik tenant (butuh x-api-key).
// Dipakai kalau tenant mau menjual tiket dari website/POS-nya sendiri.

import { NextResponse } from 'next/server'
import { wajibApiKey, catatIntegrasi } from '@/lib/integrasiAuth'

export async function GET(request: Request) {
  const auth = await wajibApiKey(request, 'integrasi-jadwal')
  if (!auth.ok) return auth.response

  const { admin, klien } = auth
  const url = new URL(request.url)
  const tanggal = (url.searchParams.get('tanggal') || '').trim()
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 100)))

  try {
    const kolom = 'id, tanggal, jam_berangkat, rute_asal, rute_tujuan, harga, status, status_jadwal, operator_id, kapal_id, kapal:kapal_id(nama)'

    let query = admin.from('jadwal').select(kolom).eq('operator_id', klien.operator_id)
    if (/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) query = query.eq('tanggal', tanggal)
    const { data: milikSendiri, error: errSendiri } = await query
    if (errSendiri) throw new Error(errSendiri.message)

    // Data lama: jadwal.operator_id NULL, pemiliknya operator kapal.
    const { data: kapalTenant } = await admin.from('kapal').select('id').eq('operator_id', klien.operator_id)
    const kapalIds = (kapalTenant || []).map((k: any) => k.id)

    let warisan: any[] = []
    if (kapalIds.length > 0) {
      let qWarisan = admin.from('jadwal').select(kolom).is('operator_id', null).in('kapal_id', kapalIds)
      if (/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) qWarisan = qWarisan.eq('tanggal', tanggal)
      const { data } = await qWarisan
      warisan = data || []
    }

    const peta = new Map<string, any>()
    ;[...(milikSendiri || []), ...warisan].forEach((j: any) => peta.set(j.id, j))
    const jadwal = [...peta.values()]
      .sort((a, b) => `${a.tanggal} ${a.jam_berangkat}`.localeCompare(`${b.tanggal} ${b.jam_berangkat}`))
      .slice(0, limit)

    const ids = jadwal.map((j: any) => j.id)
    let kosong = new Map<string, number>()
    if (ids.length > 0) {
      const { data: kursi } = await admin.from('kursi').select('jadwal_id, status').in('jadwal_id', ids)
      ;(kursi || []).forEach((k: any) => {
        if (!k.status || k.status === 'kosong') kosong.set(k.jadwal_id, (kosong.get(k.jadwal_id) || 0) + 1)
      })
    }

    catatIntegrasi('integrasi-jadwal', klien)

    return NextResponse.json({
      success: true,
      jumlah: jadwal.length,
      jadwal: jadwal.map((j: any) => ({
        id: j.id,
        tanggal: j.tanggal,
        jam_berangkat: j.jam_berangkat,
        rute_asal: j.rute_asal,
        rute_tujuan: j.rute_tujuan,
        harga: j.harga,
        kapal: j.kapal?.nama || null,
        status: j.status || null,
        status_jadwal: j.status_jadwal || null,
        kursi_kosong: kosong.get(j.id) || 0
      }))
    })
  } catch (err: any) {
    console.error('API integrasi jadwal:', err)
    return NextResponse.json({ error: err?.message || 'Gagal membaca jadwal.' }, { status: 500 })
  }
}
