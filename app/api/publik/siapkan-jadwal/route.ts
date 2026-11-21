// app/api/publik/siapkan-jadwal/route.ts
// Halaman publik /pilih-jadwal butuh jadwal harian yang dibuat otomatis dari
// template. Dulu pembuatan ini dilakukan dari browser dengan kunci anon →
// sekarang dipindah ke server supaya pengunjung tidak punya hak tulis.

import { NextResponse } from 'next/server'
import { buatClientAdmin, pesanServiceKeyKosong } from '@/lib/serverAuth'
import { beroperasiPada } from '@/lib/hari'
import { catatPermintaan, kenaBatas, kunciIp } from '@/lib/rateLimit'
import { asalDiizinkan } from '@/lib/publikGuard'

const BATAS = 60
const JENDELA = 10 * 60 * 1000

function tanggalValid(t: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(new Date(`${t}T00:00:00`).getTime())
}

export async function POST(request: Request) {
  const tolakAsal = asalDiizinkan(request)
  if (tolakAsal) return tolakAsal

  const admin = buatClientAdmin()
  if (!admin) return pesanServiceKeyKosong()

  const kunci = kunciIp(request, 'publik-siapkan-jadwal')
  if (kenaBatas(kunci, BATAS, JENDELA)) {
    return NextResponse.json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' }, { status: 429 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Format permintaan tidak valid.' }, { status: 400 })
  }

  const tanggal = String(body.tanggal || '')
  const asal = String(body.rute_asal || '').trim()
  const tujuan = String(body.rute_tujuan || '').trim()
  const operatorId = String(body.operator_id || '').trim()

  if (!tanggalValid(tanggal) || !asal || !tujuan || asal.length > 80 || tujuan.length > 80) {
    return NextResponse.json({ error: 'Parameter jadwal tidak valid.' }, { status: 400 })
  }
  if (operatorId && !/^[0-9a-f-]{36}$/i.test(operatorId)) {
    return NextResponse.json({ error: 'Operator tidak valid.' }, { status: 400 })
  }

  try {
    let qTemplate = admin
      .from('template_jadwal')
      .select('*, kapal:kapal_id(kapasitas)')
      .eq('aktif', true)
      .eq('rute_asal', asal)
      .eq('rute_tujuan', tujuan)

    if (operatorId) qTemplate = qTemplate.eq('operator_id', operatorId)

    const { data: templates, error: errTemplate } = await qTemplate
    if (errTemplate) throw new Error('Gagal membaca template: ' + errTemplate.message)

    const templatesOperasi = (templates || []).filter((t: any) => beroperasiPada(tanggal, t.hari_operasi))
    if (templatesOperasi.length === 0) {
      return NextResponse.json({ success: true, dibuat: 0 })
    }

    let qJadwal = admin
      .from('jadwal')
      .select('id, jam_berangkat, harga, kapal_id, status_jadwal')
      .eq('tanggal', tanggal)
      .eq('status', 'aktif')
      .eq('rute_asal', asal)
      .eq('rute_tujuan', tujuan)

    if (operatorId) qJadwal = qJadwal.eq('operator_id', operatorId)

    const { data: jadwalAwal } = await qJadwal
    let jadwalData = (jadwalAwal || []) as any[]

    const baru: any[] = []
    for (const t of templatesOperasi as any[]) {
      const sudahAda = jadwalData.find(
        (j) => j.kapal_id === t.kapal_id && j.jam_berangkat === t.jam_berangkat
      )
      if (!sudahAda) {
        baru.push({
          kapal_id: t.kapal_id,
          rute_asal: t.rute_asal,
          rute_tujuan: t.rute_tujuan,
          tanggal,
          jam_berangkat: t.jam_berangkat,
          harga: t.harga || 150000,
          status: 'aktif',
          status_jadwal: 'open',
          operator_id: operatorId || t.operator_id || null
        })
      }
    }

    if (baru.length > 0) {
      const { error: errInsert } = await admin.from('jadwal').insert(baru)
      if (errInsert) throw new Error('Gagal membuat jadwal: ' + errInsert.message)

      const { data: refreshed } = await qJadwal
      jadwalData = (refreshed || []) as any[]
    }

    // Buat kursi untuk jadwal yang belum punya kursi sama sekali.
    const kursiBaru: any[] = []
    for (const j of jadwalData) {
      const { data: adaKursi } = await admin.from('kursi').select('id').eq('jadwal_id', j.id).limit(1)
      if (adaKursi && adaKursi.length > 0) continue

      const t = (templatesOperasi as any[]).find(
        (x) => x.kapal_id === j.kapal_id && x.jam_berangkat === j.jam_berangkat
      )
      let kapasitas = Number(t?.kapal?.kapasitas || 0)
      if (!kapasitas) {
        const { data: kapal } = await admin.from('kapal').select('kapasitas').eq('id', j.kapal_id).maybeSingle()
        kapasitas = Number((kapal as any)?.kapasitas || 0)
      }
      if (kapasitas <= 0) continue

      for (let i = 1; i <= Math.min(kapasitas, 500); i++) {
        kursiBaru.push({ jadwal_id: j.id, nomor_kursi: String(i), status: 'kosong' })
      }
    }

    if (kursiBaru.length > 0) {
      const { error: errKursi } = await admin.from('kursi').insert(kursiBaru)
      if (errKursi) console.error('Gagal membuat kursi:', errKursi.message)
    }

    catatPermintaan(kunci, JENDELA)
    return NextResponse.json({ success: true, dibuat: baru.length, kursi: kursiBaru.length })
  } catch (err: any) {
    console.error('API siapkan-jadwal:', err)
    return NextResponse.json({ error: err?.message || 'Gagal menyiapkan jadwal.' }, { status: 500 })
  }
}
