// app/api/integrasi/kursi/route.ts
// API integrasi tenant: daftar kursi sebuah jadwal milik tenant (butuh x-api-key).

import { NextResponse } from 'next/server'
import { wajibApiKey, catatIntegrasi, jadwalMilikTenant } from '@/lib/integrasiAuth'

export async function GET(request: Request) {
  const auth = await wajibApiKey(request, 'integrasi-kursi')
  if (!auth.ok) return auth.response

  const { admin, klien } = auth
  const url = new URL(request.url)
  const jadwalId = (url.searchParams.get('jadwal_id') || '').trim()

  if (!/^[0-9a-f-]{36}$/i.test(jadwalId)) {
    return NextResponse.json({ error: 'Parameter jadwal_id tidak valid.' }, { status: 400 })
  }

  const { jadwal, error } = await jadwalMilikTenant(admin, jadwalId, klien.operator_id)
  if (!jadwal) return NextResponse.json({ error: error || 'Jadwal tidak ditemukan.' }, { status: 404 })

  const { data: kursi, error: errKursi } = await admin
    .from('kursi')
    .select('id, nomor_kursi, status')
    .eq('jadwal_id', jadwalId)

  if (errKursi) {
    return NextResponse.json({ error: 'Gagal membaca kursi: ' + errKursi.message }, { status: 500 })
  }

  const daftar = (kursi || []).sort((a: any, b: any) => Number(a.nomor_kursi) - Number(b.nomor_kursi))

  catatIntegrasi('integrasi-kursi', klien)

  return NextResponse.json({
    success: true,
    jadwal_id: jadwalId,
    kursi: daftar.map((k: any) => ({
      id: k.id,
      nomor_kursi: k.nomor_kursi,
      status: k.status || 'kosong',
      tersedia: !k.status || k.status === 'kosong'
    }))
  })
}
