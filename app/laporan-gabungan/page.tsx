'use client'

import { Fragment, Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'
import { idOperator, cocokOperator } from '@/lib/tenant'
import { muatRutePemilik, ujungRute, type RuteKapal } from '@/lib/rute'
import { urutkanLokasi } from '@/lib/lokasi'

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
        const teksRute = `${jadwal.rute_asal || '-'} → ${jadwal.rute_tujuan || '-'}`
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

  const handlePrint = () => setTimeout(() => window.print(), 100)

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

  return (
    <div className="min-h-[100dvh] w-full bg-gray-100 p-3 md:p-6 print:p-0 print:bg-white">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body { background: white; margin: 0; }
          .print-hidden { display: none !important; }
          .print-area { overflow: visible !important; }
          tr { page-break-inside: avoid; }
          table { font-size: 9px; }
          th, td { padding: 2px 4px !important; }
        }
      `}} />

      <div className="max-w-[1400px] mx-auto">
        <div className="flex flex-wrap justify-between items-start gap-3 mb-4 bg-white p-3 md:p-4 rounded shadow-sm border border-gray-200 print-hidden">
          <div>
            <h1 className="text-lg md:text-2xl font-bold text-gray-900 leading-tight">Laporan Gabungan Harian</h1>
            <p className="text-xs md:text-sm font-bold text-blue-700 mt-0.5">{labelTanggal(tanggal)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-xs md:text-sm font-bold transition shadow-sm">🖨️ Cetak</button>
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

        <section className="bg-white rounded shadow border border-gray-200 mb-4 overflow-hidden">
          <div className="px-3 md:px-4 py-3 border-b bg-gray-50">
            <h2 className="text-sm md:text-base font-bold text-gray-900">Ringkasan per Daerah</h2>
            <p className="text-[10px] md:text-xs text-gray-600">Pendapatan dihitung dari tiket dewasa yang sudah dibayar. Balita tetap dihitung sebagai penumpang.</p>
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

        <section className="bg-white rounded shadow border border-gray-200 overflow-hidden">
          <div className="px-3 md:px-4 py-3 border-b bg-gray-50">
            <h2 className="text-sm md:text-base font-bold text-gray-900">Rincian per Jam & Kapal</h2>
            <p className="text-[10px] md:text-xs text-gray-600">Setiap kapal ditampilkan terpisah, walau jam berangkatnya sama.</p>
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
                      <th className="border p-1 text-[8px] md:text-xs text-center">Dewasa/Balita</th>
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
                    <td className="border p-1 text-[9px] md:text-xs font-medium" style={{ minWidth: 120 }}>{baris.kapal}</td>
                    <td className="border p-1 text-[9px] md:text-xs text-left" style={{ minWidth: 130 }}>{baris.rute || '-'}</td>
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
