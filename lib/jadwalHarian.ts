// lib/jadwalHarian.ts
// ==================== SINKRONISASI JADWAL HARIAN ====================
//
// Satu kapal pada jam yang sama bisa menjual beberapa rute (potongan jalan),
// mis. Tarakan 14:00 → Tanjung Batu dan Tarakan 14:00 → Berau. Karena itu
// identitas sebuah jadwal adalah gabungan:
//
//   kapal_id | tanggal | rute_asal | rute_tujuan | jam_berangkat
//
// Jangan memakai (kapal_id + jam) saja: dua rute berbeda akan saling menimpa
// dan salah satu tujuan hilang dari layar Jual Tiket.
//
// Halaman publik memakai API server karena pengunjung tidak punya hak tulis.
// Logika kuncinya tetap sama dan sengaja diekspor supaya semua tempat memakai
// definisi yang identik.

import type { SupabaseClient } from '@supabase/supabase-js'
import { beroperasiPada } from './hari'

export type TemplateJadwalHarian = {
  id?: string
  kapal_id: string
  rute_asal: string
  rute_tujuan: string
  jam_berangkat: string
  harga: number | null
  hari_operasi?: string[] | null
  operator_id?: string | null
  kapal?: { kapasitas?: number | null } | null
}

export type JadwalHarian = {
  id: string
  kapal_id: string
  rute_asal: string
  rute_tujuan: string
  tanggal: string
  jam_berangkat: string
  harga: number
  status_jadwal?: string | null
  operator_id?: string | null
}

export type HasilSinkronJadwal = {
  /** Jadwal yang sudah ada di database (termasuk yang baru dibuat helper ini). */
  jadwal: JadwalHarian[]
  /** Template yang aktif pada tanggal tersebut (belum tentu punya harga). */
  templatesOperasi: TemplateJadwalHarian[]
  /** Template -> kapasitas kapal, untuk mencocokkan kursi. */
  templatePerKunci: Map<string, TemplateJadwalHarian>
  /** Template berharga yang gagal dibuatkan jadwal (mis. ditolak RLS). */
  templateTanpaJadwal: TemplateJadwalHarian[]
  /** Jumlah kursi baru yang dibuat untuk jadwal yang belum punya kursi. */
  kursiDibuat: number
}

type OpsiSinkron = {
  tanggal: string
  ruteAsal: string
  /** Kalau diisi, hanya kapal-kapal ini yang diproses (dipakai Admin Utama). */
  kapalIds?: string[] | null
  /** Cadangan operator_id kalau template lama belum punya operator_id. */
  operatorFallback?: string | null
}

/** Normalisasi jam ke bentuk HH:MM supaya '10:00' dan '10:00:00' dianggap sama. */
export function jamPendek(jam: string | null | undefined): string {
  const cocok = /^(\d{1,2})[:.](\d{2})/.exec(String(jam ?? '').trim())
  if (!cocok) return String(jam ?? '').slice(0, 5)
  return `${cocok[1].padStart(2, '0')}:${cocok[2]}`
}

/** Kunci unik satu baris jadwal: kapal + asal + tujuan + jam. */
export function kunciRuteJadwal(j: {
  kapal_id?: string | null
  rute_asal?: string | null
  rute_tujuan?: string | null
  jam_berangkat?: string | null
}): string {
  return [
    String(j.kapal_id || ''),
    String(j.rute_asal || '').trim(),
    String(j.rute_tujuan || '').trim(),
    jamPendek(j.jam_berangkat)
  ].join('|')
}

function daftarKapal(kapalIds?: string[] | null): string[] {
  return [...new Set((kapalIds || []).filter(Boolean) as string[])]
}

/**
 * Ambil jadwal satu hari dari database.
 * Filter asal selalu dipakai; filter kapal hanya kalau daftarnya tidak kosong.
 */
async function ambilJadwal(
  db: SupabaseClient,
  tanggal: string,
  ruteAsal: string,
  kapalIds: string[]
): Promise<JadwalHarian[]> {
  let q = db
    .from('jadwal')
    .select('id, kapal_id, rute_asal, rute_tujuan, tanggal, jam_berangkat, harga, status_jadwal, operator_id')
    .eq('tanggal', tanggal)
    .eq('status', 'aktif')
    .eq('rute_asal', ruteAsal)

  if (kapalIds.length > 0) q = q.in('kapal_id', kapalIds)

  const { data } = await q
  return (data || []) as unknown as JadwalHarian[]
}

/** Buat kursi untuk jadwal yang belum punya kursi sama sekali. */
async function pastikanKursi(
  db: SupabaseClient,
  jadwal: JadwalHarian[],
  templatePerKunci: Map<string, TemplateJadwalHarian>
): Promise<number> {
  if (jadwal.length === 0) return 0

  const kapalIds = [...new Set(jadwal.map((j) => j.kapal_id).filter(Boolean))]
  const { data: kapalData } = await db.from('kapal').select('id, kapasitas').in('id', kapalIds)
  const kapalMap = new Map((kapalData || []).map((k) => [String(k.id), Number(k.kapasitas) || 0]))

  let dibuat = 0

  for (const j of jadwal) {
    const { data: adaKursi } = await db
      .from('kursi')
      .select('id')
      .eq('jadwal_id', j.id)
      .limit(1)

    if (adaKursi && adaKursi.length > 0) continue

    const t = templatePerKunci.get(kunciRuteJadwal(j))
    const kapasitas =
      Number(t?.kapal?.kapasitas || 0) || kapalMap.get(String(j.kapal_id)) || 0
    if (kapasitas <= 0) continue

    const kursiPayload = []
    for (let i = 1; i <= Math.min(kapasitas, 500); i++) {
      kursiPayload.push({
        jadwal_id: j.id,
        nomor_kursi: String(i),
        status: 'kosong'
      })
    }

    const { error } = await db.from('kursi').insert(kursiPayload)
    if (error) {
      console.warn('[jadwalHarian] gagal membuat kursi:', kunciRuteJadwal(j), error.message)
      continue
    }
    dibuat += kursiPayload.length
  }

  return dibuat
}

/**
 * Pastikan semua template yang beroperasi pada `tanggal` sudah punya baris
 * `jadwal`. Aman dipanggil berulang kali dan aman untuk banyak operator karena
 * semua keputusan diambil dari data `template_jadwal` + `kapal`.
 */
export async function sinkronJadwalHarian(
  db: SupabaseClient,
  opsi: OpsiSinkron
): Promise<HasilSinkronJadwal> {
  const tanggal = String(opsi.tanggal || '').slice(0, 10)
  const ruteAsal = String(opsi.ruteAsal || '').trim()
  const kapalIds = daftarKapal(opsi.kapalIds)

  if (!tanggal || !ruteAsal) {
    return {
      jadwal: [],
      templatesOperasi: [],
      templatePerKunci: new Map(),
      templateTanpaJadwal: [],
      kursiDibuat: 0
    }
  }

  let qTemplate = db
    .from('template_jadwal')
    .select('*, kapal:kapal_id(kapasitas)')
    .eq('aktif', true)
    .eq('rute_asal', ruteAsal)

  if (kapalIds.length > 0) qTemplate = qTemplate.in('kapal_id', kapalIds)

  const { data: templateData, error: errTemplate } = await qTemplate
  if (errTemplate) {
    console.warn('[jadwalHarian] gagal membaca template:', errTemplate.message)
  }

  const templates = (templateData || []) as unknown as TemplateJadwalHarian[]
  const templatesOperasi = templates.filter((t) => beroperasiPada(tanggal, t.hari_operasi))

  const templatePerKunci = new Map<string, TemplateJadwalHarian>()
  for (const t of templates) {
    const kunci = kunciRuteJadwal(t)
    if (!templatePerKunci.has(kunci)) templatePerKunci.set(kunci, t)
  }

  let jadwal = await ambilJadwal(db, tanggal, ruteAsal, kapalIds)

  const kunciSudahAda = new Set(jadwal.map((j) => kunciRuteJadwal(j)))
  const baru: Array<Record<string, unknown>> = []

  for (const t of templatesOperasi) {
    const harga = Number(t.harga)
    // Harga WAJIB dari Manajemen Jadwal. Tanpa harga, jadwal tidak dibuat.
    if (!(harga > 0)) continue

    const kunci = kunciRuteJadwal(t)
    if (kunciSudahAda.has(kunci)) continue
    kunciSudahAda.add(kunci)

    baru.push({
      kapal_id: t.kapal_id,
      rute_asal: t.rute_asal,
      rute_tujuan: t.rute_tujuan,
      tanggal,
      jam_berangkat: t.jam_berangkat,
      harga,
      status: 'aktif',
      status_jadwal: 'open',
      operator_id: t.operator_id || opsi.operatorFallback || null
    })
  }

  if (baru.length > 0) {
    // ignoreDuplicates: kalau ada balapan dengan sesi lain, baris yang sudah
    // dibuat tidak boleh menggagalkan seluruh batch. onConflict memakai kunci
    // rute lengkap dari supabase/jadwal-rute-unik.sql.
    const { error } = await db.from('jadwal').upsert(baru, {
      onConflict: 'kapal_id,tanggal,jam_berangkat,rute_asal,rute_tujuan',
      ignoreDuplicates: true
    })

    if (error) {
      console.warn('[jadwalHarian] gagal membuat jadwal sekaligus:', error.message)

      // Fallback satu per satu: satu rute yang ditolak (mis. RLS operator lain)
      // tidak boleh membuat rute lain ikut hilang dari layar.
      for (const row of baru) {
        const { error: errSatu } = await db.from('jadwal').insert(row)
        if (errSatu) {
          console.warn('[jadwalHarian] gagal membuat jadwal:', kunciRuteJadwal(row), errSatu.message)
        }
      }
    }

    // Baca ulang supaya hasilnya termasuk baris yang baru masuk.
    jadwal = await ambilJadwal(db, tanggal, ruteAsal, kapalIds)
  }

  const kunciTerpasang = new Set(jadwal.map((j) => kunciRuteJadwal(j)))
  const templateTanpaJadwal = templatesOperasi.filter((t) => {
    if (!(Number(t.harga) > 0)) return false
    return !kunciTerpasang.has(kunciRuteJadwal(t))
  })

  const kursiDibuat = await pastikanKursi(db, jadwal, templatePerKunci)

  return {
    jadwal,
    templatesOperasi,
    templatePerKunci,
    templateTanpaJadwal,
    kursiDibuat
  }
}
