// app/api/integrasi/kursi/route.ts
// API integrasi tenant: daftar kursi sebuah jadwal milik tenant (butuh x-api-key).

import { NextResponse } from 'next/server'
import { wajibApiKey, catatIntegrasi, jadwalMilikTenant } from '@/lib/integrasiAuth'
import { nomorKursiTerpakai } from '@/lib/segmen'

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

  // Status per potongan jalan: kursi yang dipakai penumpang rute lain pada
  // keberangkatan yang sama tidak ikut terkunci kalau intervalnya tidak beririsan.
  const segmen = await nomorKursiTerpakai(admin, {
    kapal_id: String(jadwal.kapal_id || ''),
    tanggal: String(jadwal.tanggal || ''),
    jam_berangkat: String(jadwal.jam_berangkat || ''),
    rute_asal: String(jadwal.rute_asal || ''),
    rute_tujuan: String(jadwal.rute_tujuan || '')
  })

  const daftar = (kursi || [])
    .map((k: any) => {
      // Di mode segmen, kursi_pakai adalah sumber kebenaran (sudah di-backfill dari
      // tiket lama), jadi status 'terisi' legacy tidak boleh ikut mengunci kursi.
      const terisi = segmen.aktif
        ? segmen.nomor.has(String(k.nomor_kursi))
        : Boolean(k.status && k.status !== 'kosong')
      return { ...k, status: terisi ? 'terisi' : 'kosong' }
    })
    .sort((a: any, b: any) => Number(a.nomor_kursi) - Number(b.nomor_kursi))

  catatIntegrasi('integrasi-kursi', klien)

  return NextResponse.json({
    success: true,
    jadwal_id: jadwalId,
    kursi: daftar.map((k: any) => ({
      id: k.id,
      nomor_kursi: k.nomor_kursi,
      status: k.status,
      tersedia: k.status === 'kosong'
    }))
  })
}
