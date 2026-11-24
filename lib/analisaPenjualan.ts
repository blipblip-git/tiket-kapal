// lib/analisaPenjualan.ts
// Data + perhitungan untuk Laporan Analisa Penjualan (harian, bulanan, kapal).
//
// Aturan yang sama dengan laporan lain:
// - Hanya pesanan berstatus 'paid'.
// - Balita tidak menambah pendapatan (harga dianggap 0) dan tidak dihitung tiket.
// - Data selalu disaring per operator/penyewa; jadwal lama yang operator_id-nya
//   NULL tetap dikenali dari pemilik kapal (lib/tenant.ts).
import { supabase, type Profile } from './supabase'
import { idOperator, cocokOperator, ambilOperatorKapal } from './tenant'
import { muatRutePemilik, ujungRute } from './rute'
import { urutkanLokasi } from './lokasi'
import { daftarTanggalBulan } from './periode'
import { kodeDaerah } from './fee'

export type KategoriAnalisaKey =
  | 'online'
  | 'agen'
  | 'keberangkatan'
  | 'loket_petugas'
  | 'lainnya'

type DefinisiKategori = {
  key: KategoriAnalisaKey
  label: string
  kanal: string[]
}

// Semua kanal penjualan harus masuk ke salah satu kategori supaya total
// laporan selalu sama dengan total penjualan sebenarnya.
export const KATEGORI_ANALISA: DefinisiKategori[] = [
  { key: 'online', label: 'ONLINE', kanal: ['online'] },
  { key: 'agen', label: 'AGEN (SEMUA)', kanal: ['agen'] },
  { key: 'keberangkatan', label: 'KEBERANGKATAN (SEMUA)', kanal: ['keberangkatan'] },
  { key: 'loket_petugas', label: 'LOKET / PETUGAS (SEMUA)', kanal: ['loket', 'mobile', 'petugas'] },
  { key: 'lainnya', label: 'LAINNYA', kanal: [] }
]

const PETA_KANAL = new Map<string, KategoriAnalisaKey>()
KATEGORI_ANALISA.forEach((kategori) => {
  kategori.kanal.forEach((kanal) => PETA_KANAL.set(kanal, kategori.key))
})

export function kategoriDariKanal(kanal: string | null | undefined): KategoriAnalisaKey {
  const kunci = String(kanal || '').trim().toLowerCase()
  return PETA_KANAL.get(kunci) || 'lainnya'
}

export function labelKategori(key: KategoriAnalisaKey): string {
  return KATEGORI_ANALISA.find((kategori) => kategori.key === key)?.label || 'LAINNYA'
}

export type BarisAnalisa = {
  tanggal: string
  kanal: string
  kategori: KategoriAnalisaKey
  daerah: string
  kapalId: string
  kapal: string
  rute: string
  tiket: number
  penjualan: number
}

type JadwalAnalisa = {
  id?: string
  tanggal: string | null
  harga: number | null
  rute_asal: string | null
  rute_tujuan: string | null
  kapal_id: string | null
  operator_id?: string | null
}

type PesananAnalisa = {
  id: string
  is_balita: boolean | null
  kanal: string | null
  jadwal: JadwalAnalisa | null
}

type KapalAnalisa = {
  id: string
  nama: string | null
}

export type OpsiPeriodeAnalisa = {
  profile: Profile
  tanggal?: string
  bulan?: string
}

export type BarisKategoriAnalisa = {
  key: KategoriAnalisaKey
  label: string
  tiket: number
  penjualan: number
  persentase: number
}

export type BlokDaerahAnalisa = {
  daerah: string
  tiket: number
  total: number
  kategori: BarisKategoriAnalisa[]
}

export type HasilHarianAnalisa = {
  tanggal: string
  daerah: BlokDaerahAnalisa[]
  total: number
  totalTiket: number
  error?: string
}

export type KategoriBulananAnalisa = {
  key: KategoriAnalisaKey
  label: string
  perDaerah: { [daerah: string]: number }
  total: number
}

export type HasilBulananAnalisa = {
  bulan: string
  daerah: string[]
  kategori: KategoriBulananAnalisa[]
  totalPerDaerah: { [daerah: string]: number }
  grandTotal: number
  error?: string
}

export type BarisKapalAnalisa = {
  kapalId: string
  nama: string
  rute: string
  hari: number
  tiket: number
  penjualan: number
  persentase: number
}

export type HasilKapalAnalisa = {
  mode: 'harian' | 'bulanan'
  periode: string
  baris: BarisKapalAnalisa[]
  total: number
  totalTiket: number
  error?: string
}

/** Tanggal hari ini menurut WITA (UTC+8), bukan zona waktu browser. */
export function tanggalWITA(): string {
  const now = new Date()
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** "2026-11-24" -> "Selasa, 24 November 2026" tanpa bergeser karena timezone. */
export function labelTanggal(tanggal: string): string {
  const cocok = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tanggal)
  if (!cocok) return tanggal
  const tanggalUtc = new Date(Date.UTC(Number(cocok[1]), Number(cocok[2]) - 1, Number(cocok[3])))
  return tanggalUtc.toLocaleDateString('id-ID', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC'
  })
}

export function formatPersen(nilai: number): string {
  const aman = Number.isFinite(nilai) ? nilai : 0
  return `${aman.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`
}

function ruteSingkat(asal: string | null, tujuan: string | null): string {
  const kiri = kodeDaerah(String(asal || ''))
  const kanan = kodeDaerah(String(tujuan || ''))
  if (kiri === '-' && kanan === '-') return '-'
  if (kiri === '-') return kanan
  if (kanan === '-') return kiri
  return `${kiri} - ${kanan}`
}

async function muatBarisAnalisa(
  opsi: OpsiPeriodeAnalisa
): Promise<{ baris: BarisAnalisa[]; error?: string }> {
  const { profile, tanggal, bulan } = opsi
  const operatorId = idOperator(profile)

  let query = supabase
    .from('pesanan')
    .select(`
      id, is_balita, kanal,
      jadwal:jadwal_id!inner (
        id, tanggal, harga, rute_asal, rute_tujuan, kapal_id, operator_id
      )
    `)
    .eq('status', 'paid')

  if (tanggal) {
    query = query.eq('jadwal.tanggal', tanggal)
  } else {
    const tanggalList = daftarTanggalBulan(bulan || '')
    if (tanggalList.length === 0) return { baris: [] }
    query = query
      .gte('jadwal.tanggal', tanggalList[0])
      .lte('jadwal.tanggal', tanggalList[tanggalList.length - 1])
  }

  const { data, error } = await query
  if (error) return { baris: [], error: 'Gagal memuat penjualan: ' + error.message }

  const pesanan = (data || []) as unknown as PesananAnalisa[]
  const petaOperatorKapal = await ambilOperatorKapal(
    pesanan.map((item) => item.jadwal?.kapal_id)
  )

  const kapalIds = [
    ...new Set(pesanan.map((item) => item.jadwal?.kapal_id).filter(Boolean) as string[])
  ]
  const petaKapal = new Map<string, string>()
  if (kapalIds.length > 0) {
    const { data: kapalData } = await supabase
      .from('kapal')
      .select('id, nama')
      .in('id', kapalIds)
    ;(kapalData || []).forEach((kapal: KapalAnalisa) => {
      petaKapal.set(kapal.id, String(kapal.nama || '').trim() || 'Tanpa Nama')
    })
  }

  const baris: BarisAnalisa[] = []
  pesanan.forEach((item) => {
    const jadwal = item.jadwal
    if (!jadwal || !jadwal.tanggal) return
    if (!cocokOperator(jadwal, operatorId, petaOperatorKapal)) return

    const kapalId = jadwal.kapal_id || 'tanpa-kapal'
    const isBalita = item.is_balita === true
    baris.push({
      tanggal: jadwal.tanggal,
      kanal: String(item.kanal || '').trim().toLowerCase(),
      kategori: kategoriDariKanal(item.kanal),
      daerah: String(jadwal.rute_asal || '').trim() || 'Tanpa Daerah',
      kapalId,
      kapal: petaKapal.get(kapalId) || 'Tanpa Kapal',
      rute: ruteSingkat(jadwal.rute_asal, jadwal.rute_tujuan),
      tiket: isBalita ? 0 : 1,
      penjualan: isBalita ? 0 : Number(jadwal.harga || 0)
    })
  })

  return { baris }
}

async function daftarDaerahLaporan(
  profile: Profile,
  baris: BarisAnalisa[]
): Promise<string[]> {
  const rute = await muatRutePemilik(profile)
  return urutkanLokasi(
    Array.from(
      new Set([
        ...ujungRute(rute),
        ...baris.map((item) => item.daerah)
      ].filter(Boolean))
    )
  )
}

function kategoriKosong(): { [key in KategoriAnalisaKey]: { tiket: number; penjualan: number } } {
  return {
    online: { tiket: 0, penjualan: 0 },
    agen: { tiket: 0, penjualan: 0 },
    keberangkatan: { tiket: 0, penjualan: 0 },
    loket_petugas: { tiket: 0, penjualan: 0 },
    lainnya: { tiket: 0, penjualan: 0 }
  }
}

export async function muatAnalisaPenjualanHarian(
  opsi: OpsiPeriodeAnalisa & { tanggal: string }
): Promise<HasilHarianAnalisa> {
  const { baris, error } = await muatBarisAnalisa(opsi)
  if (error) {
    return { tanggal: opsi.tanggal, daerah: [], total: 0, totalTiket: 0, error }
  }

  const daerahList = await daftarDaerahLaporan(opsi.profile, baris)
  const peta = new Map<string, ReturnType<typeof kategoriKosong>>()
  daerahList.forEach((daerah) => peta.set(daerah, kategoriKosong()))

  baris.forEach((item) => {
    if (!peta.has(item.daerah)) peta.set(item.daerah, kategoriKosong())
    const sel = peta.get(item.daerah)
    if (!sel) return
    sel[item.kategori].tiket += item.tiket
    sel[item.kategori].penjualan += item.penjualan
  })

  const daerah: BlokDaerahAnalisa[] = daerahList.map((nama) => {
    const isi = peta.get(nama) || kategoriKosong()
    const total = KATEGORI_ANALISA.reduce((sum, kategori) => sum + isi[kategori.key].penjualan, 0)
    const tiket = KATEGORI_ANALISA.reduce((sum, kategori) => sum + isi[kategori.key].tiket, 0)
    return {
      daerah: nama,
      total,
      tiket,
      kategori: KATEGORI_ANALISA.map((kategori) => {
        const sel = isi[kategori.key]
        return {
          key: kategori.key,
          label: kategori.label,
          tiket: sel.tiket,
          penjualan: sel.penjualan,
          persentase: total > 0 ? (sel.penjualan / total) * 100 : 0
        }
      })
    }
  })

  return {
    tanggal: opsi.tanggal,
    daerah,
    total: daerah.reduce((sum, blok) => sum + blok.total, 0),
    totalTiket: daerah.reduce((sum, blok) => sum + blok.tiket, 0)
  }
}

export async function muatAnalisaPenjualanBulanan(
  opsi: OpsiPeriodeAnalisa & { bulan: string }
): Promise<HasilBulananAnalisa> {
  const { baris, error } = await muatBarisAnalisa(opsi)
  if (error) {
    return {
      bulan: opsi.bulan,
      daerah: [],
      kategori: [],
      totalPerDaerah: {},
      grandTotal: 0,
      error
    }
  }

  const daerahList = await daftarDaerahLaporan(opsi.profile, baris)
  const totalPerDaerah: { [daerah: string]: number } = {}
  const kategori: KategoriBulananAnalisa[] = KATEGORI_ANALISA.map((item) => {
    const perDaerah: { [daerah: string]: number } = {}
    daerahList.forEach((daerah) => { perDaerah[daerah] = 0 })
    return { key: item.key, label: item.label, perDaerah, total: 0 }
  })
  const petaKategori = new Map(kategori.map((item) => [item.key, item]))
  daerahList.forEach((daerah) => { totalPerDaerah[daerah] = 0 })

  baris.forEach((item) => {
    if (!(item.daerah in totalPerDaerah)) totalPerDaerah[item.daerah] = 0
    totalPerDaerah[item.daerah] += item.penjualan
    const kat = petaKategori.get(item.kategori)
    if (!kat) return
    kat.perDaerah[item.daerah] = (kat.perDaerah[item.daerah] || 0) + item.penjualan
    kat.total += item.penjualan
  })

  const grandTotal = Object.values(totalPerDaerah).reduce((sum, nilai) => sum + nilai, 0)
  return {
    bulan: opsi.bulan,
    daerah: daerahList,
    kategori,
    totalPerDaerah,
    grandTotal
  }
}

export async function muatAnalisaPenjualanKapal(
  opsi: OpsiPeriodeAnalisa & ({ tanggal: string; bulan?: undefined } | { bulan: string; tanggal?: undefined })
): Promise<HasilKapalAnalisa> {
  const mode = opsi.tanggal ? 'harian' : 'bulanan'
  const periode = opsi.tanggal ?? opsi.bulan ?? ''
  const { baris, error } = await muatBarisAnalisa(opsi)
  if (error) {
    return { mode, periode, baris: [], total: 0, totalTiket: 0, error }
  }

  const peta = new Map<string, {
    kapalId: string
    nama: string
    rute: Set<string>
    hari: Set<string>
    tiket: number
    penjualan: number
  }>()

  baris.forEach((item) => {
    if (!peta.has(item.kapalId)) {
      peta.set(item.kapalId, {
        kapalId: item.kapalId,
        nama: item.kapal,
        rute: new Set<string>(),
        hari: new Set<string>(),
        tiket: 0,
        penjualan: 0
      })
    }
    const kapal = peta.get(item.kapalId)
    if (!kapal) return
    if (item.rute && item.rute !== '-') kapal.rute.add(item.rute)
    kapal.hari.add(item.tanggal)
    kapal.tiket += item.tiket
    kapal.penjualan += item.penjualan
  })

  const total = [...peta.values()].reduce((sum, item) => sum + item.penjualan, 0)
  const totalTiket = [...peta.values()].reduce((sum, item) => sum + item.tiket, 0)
  const daftar: BarisKapalAnalisa[] = [...peta.values()]
    .map((item) => ({
      kapalId: item.kapalId,
      nama: item.nama,
      rute: [...item.rute].join(' / ') || '-',
      hari: item.hari.size,
      tiket: item.tiket,
      penjualan: item.penjualan,
      persentase: total > 0 ? (item.penjualan / total) * 100 : 0
    }))
    .sort((a, b) => b.penjualan - a.penjualan || a.nama.localeCompare(b.nama))

  return { mode, periode, baris: daftar, total, totalTiket }
}

