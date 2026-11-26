// app/api/publik/jadwal-hari-ini/route.ts
// Ringkasan SEMUA rute untuk hari ini (WITA) untuk beranda pembeli.
//
// Sumber data:
//   1. template_jadwal  -> daftar rute + hari operasi (rute baru otomatis ikut,
//                          halaman tidak perlu diubah saat ada kapal baru).
//   2. jadwal           -> jam, kapal, status_jadwal ('open' / 'berangkat').
//
// Template yang beroperasi hari ini tetapi belum punya baris `jadwal` akan
// dibuatkan barisnya di sini (tanpa kursi). Kursi dibuat oleh
// /api/publik/siapkan-jadwal saat pembeli benar-benar mencari rute itu.

import { NextResponse } from 'next/server'
import { buatClientAdmin, pesanServiceKeyKosong } from '@/lib/serverAuth'
import { beroperasiPada } from '@/lib/hari'
import { jamPendek, kunciRuteJadwal } from '@/lib/jadwalHarian'
import { catatPermintaan, kenaBatas, kunciIp } from '@/lib/rateLimit'
import { asalDiizinkan } from '@/lib/publikGuard'
import type { SupabaseClient } from '@supabase/supabase-js'

const BATAS = 120
const JENDELA = 10 * 60 * 1000

const KOLOM_JADWAL =
  'id, kapal_id, rute_asal, rute_tujuan, jam_berangkat, status_jadwal, operator_id'

type BarisJadwal = {
  id: string
  kapal_id: string | null
  rute_asal: string | null
  rute_tujuan: string | null
  jam_berangkat: string | null
  status_jadwal: string | null
  operator_id: string | null
}

type JadwalRingkas = {
  id: string
  nama_kapal: string
  jam_berangkat: string
  status_jadwal: string
}

type RuteRingkas = {
  asal: string
  tujuan: string
  jadwal: JadwalRingkas[]
}

type TemplateRingkas = {
  kapal_id: string | null
  rute_asal: string | null
  rute_tujuan: string | null
  jam_berangkat: string | null
  harga: number | string | null
  hari_operasi: string[] | null
  operator_id: string | null
}

/** Tanggal hari ini menurut WITA (UTC+8), bukan zona waktu server. */
function tanggalHariIniWita(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

async function ambilJadwal(admin: SupabaseClient, tanggal: string): Promise<BarisJadwal[]> {
  const { data } = await admin
    .from('jadwal')
    .select(KOLOM_JADWAL)
    .eq('tanggal', tanggal)
    .eq('status', 'aktif')

  return (data || []) as unknown as BarisJadwal[]
}

export async function GET(request: Request) {
  const tolakAsal = asalDiizinkan(request)
  if (tolakAsal) return tolakAsal

  const admin = buatClientAdmin()
  if (!admin) return pesanServiceKeyKosong()

  const kunci = kunciIp(request, 'publik-jadwal-hari-ini')
  if (kenaBatas(kunci, BATAS, JENDELA)) {
    return NextResponse.json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' }, { status: 429 })
  }

  const tanggal = tanggalHariIniWita()

  try {
    // 1. Semua template aktif, lalu saring yang beroperasi hari ini.
    const { data: templateData, error: errTemplate } = await admin
      .from('template_jadwal')
      .select('kapal_id, rute_asal, rute_tujuan, jam_berangkat, harga, hari_operasi, operator_id')
      .eq('aktif', true)

    if (errTemplate) throw new Error('Gagal membaca template jadwal: ' + errTemplate.message)

    const templatesOperasi = ((templateData || []) as unknown as TemplateRingkas[]).filter(
      (t) => beroperasiPada(tanggal, t.hari_operasi) && Number(t.harga) > 0
    )

    // 2. Jadwal yang sudah ada hari ini.
    let baris = await ambilJadwal(admin, tanggal)

    // 3. Lengkapi jadwal yang belum dibuat (tanpa kursi).
    const kunciAda = new Set(baris.map((j) => kunciRuteJadwal(j)))
    const baru: Array<Record<string, unknown>> = []

    for (const t of templatesOperasi) {
      if (!t.kapal_id) continue
      const k = kunciRuteJadwal(t)
      if (kunciAda.has(k)) continue
      kunciAda.add(k)

      baru.push({
        kapal_id: t.kapal_id,
        rute_asal: t.rute_asal,
        rute_tujuan: t.rute_tujuan,
        tanggal,
        jam_berangkat: t.jam_berangkat,
        harga: Number(t.harga),
        status: 'aktif',
        status_jadwal: 'open',
        operator_id: t.operator_id || null
      })
    }

    if (baru.length > 0) {
      const { error: errInsert } = await admin.from('jadwal').upsert(baru, {
        onConflict: 'kapal_id,tanggal,jam_berangkat,rute_asal,rute_tujuan',
        ignoreDuplicates: true
      })
      if (errInsert) {
        console.warn('[jadwal-hari-ini] gagal melengkapi jadwal:', errInsert.message)
      } else {
        baris = await ambilJadwal(admin, tanggal)
      }
    }

    // 4. Nama kapal.
    const kapalIds = [...new Set(baris.map((j) => j.kapal_id).filter(Boolean) as string[])]
    const kapalMap = new Map<string, string>()
    if (kapalIds.length > 0) {
      const { data: kapalData } = await admin.from('kapal').select('id, nama').in('id', kapalIds)
      ;(kapalData || []).forEach((k: { id?: string | null; nama?: string | null }) => {
        kapalMap.set(String(k.id), String(k.nama || '').trim() || '-')
      })
    }

    // 5. Kelompokkan per arah rute, buang duplikat kapal+jam.
    const peta = new Map<string, RuteRingkas>()
    const sudahTampil = new Set<string>()

    for (const j of baris) {
      const asal = String(j.rute_asal || '').trim()
      const tujuan = String(j.rute_tujuan || '').trim()
      if (!asal || !tujuan) continue

      const kunciRute = `${asal}|${tujuan}`
      const kunciBaris = `${kunciRute}|${j.kapal_id}|${jamPendek(j.jam_berangkat)}`
      if (sudahTampil.has(kunciBaris)) continue
      sudahTampil.add(kunciBaris)

      if (!peta.has(kunciRute)) peta.set(kunciRute, { asal, tujuan, jadwal: [] })
      peta.get(kunciRute)!.jadwal.push({
        id: String(j.id),
        nama_kapal: kapalMap.get(String(j.kapal_id)) || '-',
        jam_berangkat: jamPendek(j.jam_berangkat),
        status_jadwal: String(j.status_jadwal || 'open')
      })
    }

    const rute = [...peta.values()]
      .map((r) => ({
        ...r,
        jadwal: r.jadwal.sort(
          (a, b) =>
            a.jam_berangkat.localeCompare(b.jam_berangkat) ||
            a.nama_kapal.localeCompare(b.nama_kapal)
        )
      }))
      .sort((a, b) => a.asal.localeCompare(b.asal) || a.tujuan.localeCompare(b.tujuan))

    catatPermintaan(kunci, JENDELA)
    return NextResponse.json({ tanggal, rute })
  } catch (err) {
    const pesan = err instanceof Error ? err.message : 'Gagal memuat jadwal hari ini.'
    console.error('API jadwal-hari-ini:', err)
    return NextResponse.json({ error: pesan }, { status: 500 })
  }
}

