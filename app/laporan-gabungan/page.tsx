'use client'

import { Fragment, Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'
import { idOperator, cocokOperator } from '@/lib/tenant'
import { muatRutePemilik, ujungRute, type RuteKapal } from '@/lib/rute'
import { urutkanLokasi } from '@/lib/lokasi'
import { kodeDaerah } from '@/lib/fee'
import { tanggalCetakSekarang } from '@/lib/periode'

type SelDaerah = {
  dewasa: number
  balita: number
  pendapatan: number
}

type JadwalRingkas = {
  id?: string
  rute_asal: string | null
  rute_tujuan: string | null
  jam_berangkat: string | null
  kapal_id: string | null
  operator_id?: string | null
  harga?: number | null
}

type PesananRingkas = {
  id: string
  is_balita: boolean | null
  jadwal: JadwalRingkas | null
}

type KapalRingkas = {
  id: string
  nama: string | null
  operator_id: string | null
}

type BarisKeberangkatan = {
  kunci: string
  jam: string
  kapal: string
  rute: string
  perDaerah: { [daerah: string]: SelDaerah }
  total: number
}

function tanggalWITA(): string {
  const now = new Date()
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function tanggalValid(tanggal: string | null): tanggal is string {
  if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return false
  return !Number.isNaN(new Date(`${tanggal}T00:00:00Z`).getTime())
}

function labelTanggal(tanggal: string): string {
  const cocok = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tanggal)
  if (!cocok) return tanggal
  const tanggalUtc = new Date(Date.UTC(Number(cocok[1]), Number(cocok[2]) - 1, Number(cocok[3])))
  return tanggalUtc.toLocaleDateString('id-ID', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC'
  })
}

function selKosong(): SelDaerah {
  return { dewasa: 0, balita: 0, pendapatan: 0 }
}

function formatRupiah(nilai: number): string {
  return `Rp ${nilai.toLocaleString('id-ID')}`
}

/**
 * Potong data menjadi beberapa halaman cetak.
 * Pemotongan manual dipakai supaya tidak ada baris yang terbelah di batas
 * halaman (aturan page-break CSS sering diabaikan saat cetak PDF).
 */
function bagiHalaman<T>(daftar: T[], perHalaman: number): T[][] {
  if (daftar.length === 0) return [[]]
  const hasil: T[][] = []
  for (let i = 0; i < daftar.length; i += perHalaman) {
    hasil.push(daftar.slice(i, i + perHalaman))
  }
  return hasil
}

// Jumlah baris per lembar cetak (A4): ringkasan portrait, rincian landscape.
const BARIS_RINGKASAN_PER_HALAMAN = 30
const BARIS_RINCIAN_PER_HALAMAN = 18

function LaporanGabunganContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tanggalParam = searchParams.get('tanggal')

  const [profile, setProfile] = useState<Profile | null>(null)
  const [ruteList, setRuteList] = useState<RuteKapal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tanggal, setTanggal] = useState(() => (tanggalValid(tanggalParam) ? tanggalParam : tanggalWITA()))
  const [ringkasan, setRingkasan] = useState<{ [daerah: string]: SelDaerah }>({})
  const [keberangkatan, setKeberangkatan] = useState<BarisKeberangkatan[]>([])
  // Cetak ringkasan dan rincian dipisah supaya PDF ringkasan tidak ikut
  // membawa tabel rincian yang lebar, dan rincian bisa dicetak landscape.
  const [printMode, setPrintMode] = useState<'ringkasan' | 'rincian'>('ringkasan')
  // printTick memicu window.print() SETELAH mode cetak benar-benar ter-render,
  // supaya orientasi kertas dan isi lembar tidak tertinggal satu langkah.
  const [printTick, setPrintTick] = useState(0)

  useEffect(() => {
    async function init() {
      let currentProfile = getOperatorSession()
      if (!currentProfile) currentProfile = await getProfile()
      if (!currentProfile) { router.push('/login'); return }
      setProfile(currentProfile)

      const daftarRute = await muatRutePemilik(currentProfile)
      setRuteList(daftarRute)
    }
    init()
  }, [router])

  useEffect(() => {
    let masihAktif = true

    async function fetchData() {
      if (!profile || !tanggal) return
      setLoading(true)
      setError('')

      const operatorId = idOperator(profile)

      const [hasilPesanan, hasilJadwal] = await Promise.all([
        supabase
          .from('pesanan')
          .select(`
            id, is_balita,
            jadwal:jadwal_id!inner (id, rute_asal, rute_tujuan, harga, tanggal, jam_berangkat, kapal_id, operator_id)
          `)
          .eq('status', 'paid')
          .eq('jadwal.tanggal', tanggal),
        supabase
          .from('jadwal')
          .select('id, rute_asal, rute_tujuan, jam_berangkat, kapal_id, operator_id')
          .eq('tanggal', tanggal)
      ])

      if (hasilPesanan.error) {
        if (!masihAktif) return
        setError('Gagal memuat laporan: ' + hasilPesanan.error.message)
        setRingkasan({})
        setKeberangkatan([])
        setLoading(false)
        return
      }

      const pesananData = (hasilPesanan.data || []) as unknown as PesananRingkas[]
      const jadwalData = (hasilJadwal.data || []) as unknown as JadwalRingkas[]

      const kapalIds = Array.from(new Set([
        ...pesananData.map((p) => p.jadwal?.kapal_id),
        ...jadwalData.map((j) => j.kapal_id),
      ].filter(Boolean) as string[]))

      const kapalMap = new Map<string, KapalRingkas>()
      const petaOperatorKapal = new Map<string, string | null>()
      if (kapalIds.length > 0) {
        const { data: kapalData } = await supabase
          .from('kapal')
          .select('id, nama, operator_id')
          .in('id', kapalIds)
        ;(kapalData || []).forEach((k: KapalRingkas) => {
          kapalMap.set(k.id, k)
          petaOperatorKapal.set(k.id, k.operator_id || null)
        })
      }

      const pesananCocok = pesananData.filter((item) => {
        if (!item.jadwal) return false
        return cocokOperator(item.jadwal, operatorId, petaOperatorKapal)
      })
      const jadwalCocok = jadwalData.filter((j) =>
        cocokOperator(j, operatorId, petaOperatorKapal)
      )

      const daerahAwal = urutkanLokasi(ujungRute(ruteList))
      const mapRingkasan: { [daerah: string]: SelDaerah } = {}
      daerahAwal.forEach((daerah) => { mapRingkasan[daerah] = selKosong() })

      const mapBaris: { [kunci: string]: BarisKeberangkatan } = {}

      function pastikanBaris(jadwal: JadwalRingkas): BarisKeberangkatan {
        const jam = String(jadwal.jam_berangkat || '').slice(0, 5)
        const kapalId = String(jadwal.kapal_id || '-')
        const kunci = `${jam}|${kapalId}`

        if (!mapBaris[kunci]) {
          mapBaris[kunci] = {
            kunci,
            jam,
            kapal: kapalMap.get(jadwal.kapal_id || '')?.nama || '-',
            rute: '',
            perDaerah: {},
            total: 0,
          }
        }

        const baris = mapBaris[kunci]
        // Singkatan daerah dipakai di kolom rute agar tabel rincian tetap
        // ringkas saat dicetak landscape (Tarakan - Sungai Nyamuk -> TRK - SNK).
        const teksRute = `${kodeDaerah(jadwal.rute_asal || '-')} - ${kodeDaerah(jadwal.rute_tujuan || '-')}`
        const ruteUnik = new Set(baris.rute.split(', ').filter(Boolean))
        ruteUnik.add(teksRute)
        baris.rute = Array.from(ruteUnik).join(', ')
        return baris
      }

      // Jadwal tetap ditampilkan walau belum ada penjualan (0 penumpang).
      jadwalCocok.forEach((jadwal) => pastikanBaris(jadwal))

      pesananCocok.forEach((item) => {
        const jadwal = item.jadwal
        if (!jadwal) return
        const baris = pastikanBaris(jadwal)
        const daerah = String(jadwal.rute_asal || 'Lainnya').trim() || 'Lainnya'

        if (!mapRingkasan[daerah]) mapRingkasan[daerah] = selKosong()
        if (!baris.perDaerah[daerah]) baris.perDaerah[daerah] = selKosong()

        const sel = mapRingkasan[daerah]
        const selBaris = baris.perDaerah[daerah]

        if (item.is_balita) {
          sel.balita += 1
          selBaris.balita += 1
        } else {
          const harga = Number(jadwal.harga || 0)
          sel.dewasa += 1
          sel.pendapatan += harga
          selBaris.dewasa += 1
          selBaris.pendapatan += harga
          baris.total += harga
        }
      })

      if (!masihAktif) return
      setRingkasan(mapRingkasan)
      setKeberangkatan(
        Object.values(mapBaris).sort((a, b) =>
          a.jam.localeCompare(b.jam) || a.kapal.localeCompare(b.kapal)
        )
      )
      setLoading(false)
    }

    fetchData()

    return () => {
      masihAktif = false
    }
  }, [profile, tanggal, ruteList])

  useEffect(() => {
    if (printTick === 0) return
    const timer = window.setTimeout(() => window.print(), 200)
    return () => window.clearTimeout(timer)
  }, [printTick])

  const handlePrint = (mode: 'ringkasan' | 'rincian') => {
    setPrintMode(mode)
    setPrintTick((n) => n + 1)
  }

  if (loading) return <p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>
  if (error) return <p className="p-6 text-center text-red-600 mt-10">{error}</p>
  if (!profile) return null

  const daerahList = urutkanLokasi(Array.from(new Set([
    ...ujungRute(ruteList),
    ...Object.keys(ringkasan),
    ...keberangkatan.flatMap((b) => Object.keys(b.perDaerah)),
  ])))

  const totalKeseluruhan = daerahList.reduce((sum, daerah) => {
    return sum + (ringkasan[daerah]?.pendapatan || 0)
  }, 0)

  const totalDewasa = daerahList.reduce((sum, daerah) => sum + (ringkasan[daerah]?.dewasa || 0), 0)
  const totalBalita = daerahList.reduce((sum, daerah) => sum + (ringkasan[daerah]?.balita || 0), 0)

  // Satu lembar cetak = satu halaman; nomor halaman ditulis manual di bawah.
  const halamanRingkasan = bagiHalaman(daerahList, BARIS_RINGKASAN_PER_HALAMAN)
  const halamanRincian = bagiHalaman(keberangkatan, BARIS_RINCIAN_PER_HALAMAN)
  const tanggalCetak = tanggalCetakSekarang()

  return (
    <div className="min-h-[100dvh] w-full bg-gray-100 p-3 md:p-6 print:p-0 print:bg-white">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          /* Ringkasan per Daerah WAJIB portrait, rincian tetap landscape.
             Named page dipakai supaya orientasi tiap bagian berbeda. */
          @page { size: A4 portrait; margin: 10mm; }
          @page ringkasan { size: A4 portrait; margin: 10mm; }
          @page rincian { size: A4 landscape; margin: 10mm; }
          body { background: white; margin: 0; }
          .print-hidden { display: none !important; }
          .lembar {
            position: relative;
            page-break-after: always;
            break-after: page;
            box-sizing: border-box;
          }
          .lembar:last-child { page-break-after: auto; break-after: auto; }
          .lembar-ringkasan { page: ringkasan; min-height: 272mm; }
          .lembar-rincian { page: rincian; min-height: 185mm; }
          .nomor-halaman {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            text-align: center;
            font-size: 11px;
            font-weight: bold;
            color: #000;
          }
          table { border-collapse: collapse; }
          thead { display: table-header-group; }
          tr, td, th { page-break-inside: avoid; break-inside: avoid; }
          .tabel-ringkasan { font-size: 11px; }
          .tabel-rincian { font-size: 7.5px; }
          .tabel-rincian th, .tabel-rincian td { padding: 1px 2px !important; }
          th, td { padding: 2px 4px !important; }
        }
      `}} />

      <div className="max-w-[1400px] mx-auto">
        <div className="flex flex-wrap justify-between items-start gap-3 mb-4 bg-white p-3 md:p-4 rounded shadow-sm border border-gray-200 print-hidden">
          <div>
            <h1 className="text-lg md:text-2xl font-bold text-gray-900 leading-tight">Laporan Gabungan Harian</h1>
            <p className="text-xs md:text-sm font-bold text-blue-700 mt-0.5">{labelTanggal(tanggal)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => router.push('/dashboard')} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded text-xs md:text-sm font-bold transition">Kembali</button>
          </div>
        </div>

        <div className="bg-white p-3 md:p-4 rounded shadow mb-4 flex flex-wrap items-center gap-2 border border-gray-200 print-hidden">
          <label className="text-xs md:text-sm font-medium text-gray-700">Pilih Tanggal:</label>
          <input
            type="date"
            value={tanggal}
            onChange={(e) => {
              const nilai = e.target.value
              if (!nilai) return
              setTanggal(nilai)
              router.replace(`/laporan-gabungan?tanggal=${nilai}`)
            }}
            className="border rounded px-2 py-1 text-xs md:text-sm text-gray-900"
          />
          <span className="text-xs text-gray-500 ml-auto">Total: <b className="text-gray-900">{formatRupiah(totalKeseluruhan)}</b> • {daerahList.length} daerah</span>
        </div>

        <section className="print-hidden bg-white rounded shadow border border-gray-200 mb-4 overflow-hidden">
          <div className="px-3 md:px-4 py-3 border-b bg-gray-50 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm md:text-base font-bold text-gray-900">Ringkasan per Daerah</h2>
              <p className="text-[10px] md:text-xs text-gray-600 mt-0.5">Tanggal : {labelTanggal(tanggal)}</p>
            </div>
            <button onClick={() => handlePrint('ringkasan')} className="print-hidden bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-xs md:text-sm font-bold transition shadow-sm">🖨️ Cetak Ringkasan</button>
          </div>
          <div className="overflow-x-auto print-area">
            <table className="w-full border-collapse text-gray-900">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="border p-2 text-[10px] md:text-xs text-left">Daerah</th>
                  <th className="border p-2 text-[10px] md:text-xs text-center">Dewasa</th>
                  <th className="border p-2 text-[10px] md:text-xs text-center">Balita</th>
                  <th className="border p-2 text-[10px] md:text-xs text-right">Pendapatan</th>
                  <th className="border p-2 text-[10px] md:text-xs text-center print-hidden">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {daerahList.length === 0 ? (
                  <tr><td colSpan={5} className="p-4 text-center text-xs text-gray-500">Belum ada rute/penjualan pada tanggal ini.</td></tr>
                ) : daerahList.map((daerah) => {
                  const sel = ringkasan[daerah] || selKosong()
                  return (
                    <tr key={daerah} className="hover:bg-gray-50">
                      <td className="border p-2 text-xs md:text-sm font-bold">{daerah}</td>
                      <td className="border p-2 text-xs md:text-sm text-center">{sel.dewasa}</td>
                      <td className="border p-2 text-xs md:text-sm text-center">{sel.balita}</td>
                      <td className="border p-2 text-xs md:text-sm text-right font-bold">{formatRupiah(sel.pendapatan)}</td>
                      <td className="border p-2 text-center print-hidden">
                        <button
                          onClick={() => router.push(`/laporan?view=penjualan&lokasi=${encodeURIComponent(daerah)}&tanggal=${tanggal}`)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-[10px] md:text-xs font-bold"
                        >Rinci</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-blue-600 text-white font-bold">
                <tr>
                  <td className="border p-2 text-xs md:text-sm">TOTAL</td>
                  <td className="border p-2 text-xs md:text-sm text-center">{totalDewasa}</td>
                  <td className="border p-2 text-xs md:text-sm text-center">{totalBalita}</td>
                  <td className="border p-2 text-xs md:text-sm text-right">{formatRupiah(totalKeseluruhan)}</td>
                  <td className="border p-2 text-xs md:text-sm text-center print-hidden">-</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="print-hidden bg-white rounded shadow border border-gray-200 overflow-hidden">
          <div className="px-3 md:px-4 py-3 border-b bg-gray-50 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm md:text-base font-bold text-gray-900">Rincian per Jam &amp; Kapal</h2>
              <p className="text-[10px] md:text-xs text-gray-600 mt-0.5">Tanggal : {labelTanggal(tanggal)}</p>
            </div>
            <button onClick={() => handlePrint('rincian')} className="print-hidden bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded text-xs md:text-sm font-bold transition shadow-sm">🖨️ Cetak Rincian</button>
          </div>
          <div className="overflow-x-auto print-area">
            <table className="w-full min-w-[900px] border-collapse text-gray-900">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="border p-1 text-[9px] md:text-xs text-center" rowSpan={2}>Jam</th>
                  <th className="border p-1 text-[9px] md:text-xs text-center" rowSpan={2}>Kapal</th>
                  <th className="border p-1 text-[9px] md:text-xs text-center" rowSpan={2}>Rute</th>
                  {daerahList.map((daerah) => (
                    <th key={daerah} colSpan={2} className="border p-1 text-[9px] md:text-xs text-center whitespace-nowrap">{daerah}</th>
                  ))}
                  <th className="border p-1 text-[9px] md:text-xs text-center" rowSpan={2}>Total</th>
                </tr>
                <tr className="bg-gray-100">
                  {daerahList.map((daerah) => (
                    <Fragment key={daerah}>
                      <th className="border p-1 text-[8px] md:text-xs text-center">D/B</th>
                      <th className="border p-1 text-[8px] md:text-xs text-center">Pendapatan</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {keberangkatan.length === 0 ? (
                  <tr><td colSpan={4 + daerahList.length * 2} className="p-4 text-center text-xs text-gray-500">Belum ada jadwal/penjualan pada tanggal ini.</td></tr>
                ) : keberangkatan.map((baris) => (
                  <tr key={baris.kunci} className="hover:bg-gray-50 text-center">
                    <td className="border p-1 text-[9px] md:text-xs font-bold whitespace-nowrap">{baris.jam}</td>
                    <td className="border p-1 text-[9px] md:text-xs font-medium text-left" style={{ minWidth: 120 }}>{baris.kapal}</td>
                    <td className="border p-1 text-[9px] md:text-xs text-center" style={{ minWidth: 130 }}>{baris.rute || '-'}</td>
                    {daerahList.map((daerah) => {
                      const sel = baris.perDaerah[daerah] || selKosong()
                      return (
                        <Fragment key={daerah}>
                          <td className={`border p-1 text-[9px] md:text-xs font-bold ${sel.dewasa > 0 || sel.balita > 0 ? 'text-blue-700' : 'text-gray-400'}`}>{sel.dewasa}/{sel.balita}</td>
                          <td className={`border p-1 text-[9px] md:text-xs text-right whitespace-nowrap ${sel.pendapatan > 0 ? '' : 'text-gray-400'}`}>{formatRupiah(sel.pendapatan)}</td>
                        </Fragment>
                      )
                    })}
                    <td className={`border p-1 text-[9px] md:text-xs font-bold text-right whitespace-nowrap ${baris.total > 0 ? 'text-blue-700' : 'text-gray-400'}`}>{formatRupiah(baris.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-blue-600 text-white font-bold text-center">
                <tr>
                  <td colSpan={3} className="border p-1 text-[9px] md:text-xs">TOTAL</td>
                  {daerahList.map((daerah) => {
                    const sel = ringkasan[daerah] || selKosong()
                    return (
                      <Fragment key={daerah}>
                        <td className="border p-1 text-[9px] md:text-xs">{sel.dewasa}/{sel.balita}</td>
                        <td className="border p-1 text-[9px] md:text-xs text-right whitespace-nowrap">{formatRupiah(sel.pendapatan)}</td>
                      </Fragment>
                    )
                  })}
                  <td className="border p-1 text-[9px] md:text-xs text-right whitespace-nowrap">{formatRupiah(totalKeseluruhan)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* AREA CETAK: satu section = satu halaman, nomor halaman manual */}
        {printMode === 'ringkasan' && (
          <div className="hidden print:block">
            {halamanRingkasan.map((daftarDaerah, idxHalaman) => {
              const halamanTerakhir = idxHalaman === halamanRingkasan.length - 1
              return (
                <section key={`ringkasan-${idxHalaman}`} className="lembar lembar-ringkasan">
                  <h1 className="text-xl font-bold text-center mb-4">LAPORAN RINGKASAN PER DAERAH</h1>
                  <div className="mb-3 text-sm grid grid-cols-[110px_10px_1fr] gap-y-1 text-gray-900">
                    <span>Tanggal</span><span>:</span><span>{labelTanggal(tanggal)}</span>
                    <span>Dicetak</span><span>:</span><span>{tanggalCetak}</span>
                  </div>
                  <table className="tabel-ringkasan w-full border-collapse border border-gray-400">
                    <thead>
                      <tr className="bg-gray-200 text-center text-gray-900">
                        <th className="border border-gray-400 px-2 py-1 text-left">DAERAH</th>
                        <th className="border border-gray-400 px-2 py-1" style={{ width: '70px' }}>DEWASA</th>
                        <th className="border border-gray-400 px-2 py-1" style={{ width: '70px' }}>BALITA</th>
                        <th className="border border-gray-400 px-2 py-1" style={{ width: '150px' }}>PENDAPATAN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daftarDaerah.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="border border-gray-400 px-2 py-3 text-center italic text-gray-700">
                            Belum ada rute/penjualan pada tanggal ini.
                          </td>
                        </tr>
                      ) : daftarDaerah.map((daerahCetak) => {
                        const sel = ringkasan[daerahCetak] || selKosong()
                        return (
                          <tr key={daerahCetak} className="text-gray-900">
                            <td className="border border-gray-400 px-2 py-1 font-bold text-left">{daerahCetak}</td>
                            <td className="border border-gray-400 px-2 py-1 text-center">{sel.dewasa}</td>
                            <td className="border border-gray-400 px-2 py-1 text-center">{sel.balita}</td>
                            <td className="border border-gray-400 px-2 py-1 text-right whitespace-nowrap">{formatRupiah(sel.pendapatan)}</td>
                          </tr>
                        )
                      })}
                      {halamanTerakhir && (
                        <tr className="bg-gray-300 font-bold text-center text-gray-900">
                          <td className="border border-gray-400 px-2 py-1 text-left">TOTAL</td>
                          <td className="border border-gray-400 px-2 py-1">{totalDewasa}</td>
                          <td className="border border-gray-400 px-2 py-1">{totalBalita}</td>
                          <td className="border border-gray-400 px-2 py-1 text-right whitespace-nowrap">{formatRupiah(totalKeseluruhan)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <div className="nomor-halaman">Halaman {idxHalaman + 1} dari {halamanRingkasan.length}</div>
                </section>
              )
            })}
          </div>
        )}

        {printMode === 'rincian' && (
          <div className="hidden print:block">
            {halamanRincian.map((daftarBaris, idxHalaman) => {
              const halamanTerakhir = idxHalaman === halamanRincian.length - 1
              return (
                <section key={`rincian-${idxHalaman}`} className="lembar lembar-rincian">
                  <h1 className="text-lg font-bold text-center mb-3">LAPORAN RINCIAN PER JAM &amp; KAPAL</h1>
                  <div className="mb-2 text-sm grid grid-cols-[110px_10px_1fr] gap-y-1 text-gray-900">
                    <span>Tanggal</span><span>:</span><span>{labelTanggal(tanggal)}</span>
                    <span>Dicetak</span><span>:</span><span>{tanggalCetak}</span>
                  </div>
                  <table className="tabel-rincian w-full border-collapse border border-gray-400">
                    <thead>
                      <tr className="bg-gray-200 text-center text-gray-900">
                        <th className="border border-gray-400 px-1 py-1" rowSpan={2}>JAM</th>
                        <th className="border border-gray-400 px-1 py-1 text-left" rowSpan={2}>KAPAL</th>
                        <th className="border border-gray-400 px-1 py-1" rowSpan={2}>RUTE</th>
                        {daerahList.map((daerah) => (
                          <th key={daerah} colSpan={2} className="border border-gray-400 px-1 py-1 whitespace-nowrap">{daerah}</th>
                        ))}
                        <th className="border border-gray-400 px-1 py-1" rowSpan={2}>TOTAL</th>
                      </tr>
                      <tr className="bg-gray-200 text-center text-gray-900">
                        {daerahList.map((daerah) => (
                          <Fragment key={daerah}>
                            <th className="border border-gray-400 px-1 py-1">D/B</th>
                            <th className="border border-gray-400 px-1 py-1">PENDAPATAN</th>
                          </Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {daftarBaris.length === 0 ? (
                        <tr>
                          <td colSpan={4 + daerahList.length * 2} className="border border-gray-400 px-2 py-3 text-center italic text-gray-700">
                            Belum ada jadwal/penjualan pada tanggal ini.
                          </td>
                        </tr>
                      ) : daftarBaris.map((baris) => (
                        <tr key={baris.kunci} className="text-center text-gray-900">
                          <td className="border border-gray-400 px-1 py-1 font-bold whitespace-nowrap">{baris.jam}</td>
                          <td className="border border-gray-400 px-1 py-1 text-left">{baris.kapal}</td>
                          <td className="border border-gray-400 px-1 py-1 text-center whitespace-nowrap">{baris.rute || '-'}</td>
                          {daerahList.map((daerah) => {
                            const sel = baris.perDaerah[daerah] || selKosong()
                            return (
                              <Fragment key={daerah}>
                                <td className="border border-gray-400 px-1 py-1">{sel.dewasa}/{sel.balita}</td>
                                <td className="border border-gray-400 px-1 py-1 text-right whitespace-nowrap">{formatRupiah(sel.pendapatan)}</td>
                              </Fragment>
                            )
                          })}
                          <td className="border border-gray-400 px-1 py-1 text-right font-bold whitespace-nowrap">{formatRupiah(baris.total)}</td>
                        </tr>
                      ))}
                      {halamanTerakhir && (
                        <tr className="bg-gray-300 font-bold text-center text-gray-900">
                          <td colSpan={3} className="border border-gray-400 px-1 py-1 text-left">TOTAL</td>
                          {daerahList.map((daerah) => {
                            const sel = ringkasan[daerah] || selKosong()
                            return (
                              <Fragment key={daerah}>
                                <td className="border border-gray-400 px-1 py-1">{sel.dewasa}/{sel.balita}</td>
                                <td className="border border-gray-400 px-1 py-1 text-right whitespace-nowrap">{formatRupiah(sel.pendapatan)}</td>
                              </Fragment>
                            )
                          })}
                          <td className="border border-gray-400 px-1 py-1 text-right whitespace-nowrap">{formatRupiah(totalKeseluruhan)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <div className="nomor-halaman">Halaman {idxHalaman + 1} dari {halamanRincian.length}</div>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function LaporanGabunganPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>}>
      <LaporanGabunganContent />
    </Suspense>
  )
}
