'use client'

import { useEffect, useState, Suspense, Fragment } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'
import { idOperator, cocokOperator } from '@/lib/tenant'
import {
  NAMA_BULAN,
  bulanSekarang,
  daftarTanggalBulan,
  formatRupiah,
  formatTanggalPendek,
  labelBulan,
  parseBulan,
  tanggalCetakSekarang
} from '@/lib/periode'

type SelLokasi = {
  kursi: number
  tiket: number
}

type BarisGabungan = {
  tanggal: string
  perLokasi: { [lokasi: string]: SelLokasi }
}

// Semua kota diurutkan alfabetis; tidak ada daerah yang diprioritaskan.
function urutkanLokasi(a: string, b: string) {
  return a.localeCompare(b)
}

function selKosong(): SelLokasi {
  return { kursi: 0, tiket: 0 }
}

function LaporanGabunganBulananContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const bulanParam = searchParams.get('bulan')

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lokasiList, setLokasiList] = useState<string[]>([])
  const [baris, setBaris] = useState<BarisGabungan[]>([])

  const bulanAktif = parseBulan(bulanParam) ? (bulanParam as string) : bulanSekarang()
  const infoBulan = parseBulan(bulanAktif)
  const tahunAktif = infoBulan ? infoBulan.tahun : new Date().getFullYear()
  const nomorBulanAktif = infoBulan ? infoBulan.bulan : new Date().getMonth() + 1

  useEffect(() => {
    async function init() {
      let currentProfile = getOperatorSession()
      if (!currentProfile) {
        const adminProfile = await getProfile()
        if (adminProfile) currentProfile = adminProfile
      }
      if (!currentProfile) { router.push('/login'); return }
      if (currentProfile.role !== 'admin_utama' && currentProfile.role !== 'superadmin') {
        setError('Anda tidak punya akses')
        setLoading(false)
        return
      }
      setProfile(currentProfile)
    }
    init()
  }, [router])

  useEffect(() => {
    async function fetchData() {
      if (!profile) return
      setLoading(true)
      setError('')

      const tanggalList = daftarTanggalBulan(bulanAktif)
      const awal = tanggalList[0]
      const akhir = tanggalList[tanggalList.length - 1]
      // KUNCI MULTI-TENANT: operator hanya melihat data miliknya sendiri
      const operatorId = idOperator(profile)

      let queryJadwal = supabase
        .from('jadwal')
        .select('rute_asal, kapal_id, operator_id')
        .gte('tanggal', awal)
        .lte('tanggal', akhir)

      const [hasilPesanan, hasilJadwal] = await Promise.all([
        supabase
          .from('pesanan')
          .select('id, is_balita, induk_id, jadwal:jadwal_id(rute_asal, harga, tanggal, kapal_id, operator_id)')
          .eq('status', 'paid')
          .gte('jadwal.tanggal', awal)
          .lte('jadwal.tanggal', akhir),
        queryJadwal
      ])

      if (hasilPesanan.error) {
        setError('Gagal memuat data: ' + hasilPesanan.error.message)
        setBaris([])
        setLokasiList([])
        setLoading(false)
        return
      }

      // Pemilik data lama ditentukan dari kapal (jadwal.operator_id bisa NULL).
      const petaOperatorKapal = new Map<string, string | null>()
      const kapalIds = [
        ...new Set([
          ...(hasilPesanan.data || []).map((item: any) => item.jadwal?.kapal_id),
          ...(hasilJadwal.data || []).map((j: any) => j.kapal_id)
        ].filter(Boolean) as string[])
      ]
      if (kapalIds.length > 0) {
        const { data: kapalData } = await supabase.from('kapal').select('id, operator_id').in('id', kapalIds)
        kapalData?.forEach((k: any) => petaOperatorKapal.set(k.id, k.operator_id || null))
      }

      const mapTanggal: { [tanggal: string]: { [lokasi: string]: SelLokasi } } = {}
      tanggalList.forEach((t) => { mapTanggal[t] = {} })

      const kumpulanLokasi = new Set<string>()

      // Daerah diambil dari JADWAL bulan ini, supaya daerah 0 penjualan tetap muncul kolomnya
      ;(hasilJadwal.data || []).forEach((j: any) => {
        if (!cocokOperator(j, operatorId, petaOperatorKapal)) return
        if (j.rute_asal) kumpulanLokasi.add(j.rute_asal)
      })

      ;(hasilPesanan.data || []).forEach((item: any) => {
        const jadwal = item.jadwal
        if (!jadwal || !jadwal.tanggal) return
        if (!cocokOperator(jadwal, operatorId, petaOperatorKapal)) return

        const lokasi = jadwal.rute_asal || 'Lainnya'
        kumpulanLokasi.add(lokasi)

        if (!mapTanggal[jadwal.tanggal]) mapTanggal[jadwal.tanggal] = {}
        if (!mapTanggal[jadwal.tanggal][lokasi]) mapTanggal[jadwal.tanggal][lokasi] = selKosong()

        const sel = mapTanggal[jadwal.tanggal][lokasi]
        // 1 tiket = 1 barcode = 1 kursi. Balita nempel di tiket ortu (induk_id) tidak menambah kursi.
        if (!(item.is_balita && item.induk_id)) sel.kursi += 1
        sel.tiket += item.is_balita ? 0 : (jadwal.harga || 0)
      })

      setLokasiList(Array.from(kumpulanLokasi).filter(Boolean).sort(urutkanLokasi))
      setBaris(tanggalList.map((t) => ({ tanggal: t, perLokasi: mapTanggal[t] || {} })))
      setLoading(false)
    }
    fetchData()
  }, [profile, bulanAktif])

  const handleGantiBulan = (nomorBulan: number, tahun: number) => {
    const bulanBaru = `${tahun}-${String(nomorBulan).padStart(2, '0')}`
    router.replace(`/laporan-gabungan-bulanan?bulan=${bulanBaru}`)
  }

  const handlePrint = () => setTimeout(() => window.print(), 100)

  const bukaRinci = (lokasi: string, tanggal: string) => {
    router.push(`/laporan?view=penjualan&lokasi=${encodeURIComponent(lokasi)}&tanggal=${tanggal}`)
  }

  if (loading) return <p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>
  if (error) return <p className="p-6 text-center text-red-600 mt-10">{error}</p>
  if (!profile) return null

  const totalPerLokasi: { [lokasi: string]: SelLokasi } = {}
  lokasiList.forEach((lokasi) => { totalPerLokasi[lokasi] = selKosong() })
  baris.forEach((b) => {
    lokasiList.forEach((lokasi) => {
      const sel = b.perLokasi[lokasi] || selKosong()
      totalPerLokasi[lokasi].kursi += sel.kursi
      totalPerLokasi[lokasi].tiket += sel.tiket
    })
  })

  const totalBaris = (b: BarisGabungan) =>
    lokasiList.reduce((sum, lokasi) => sum + (b.perLokasi[lokasi]?.tiket || 0), 0)
  const grandTotal = lokasiList.reduce((sum, lokasi) => sum + totalPerLokasi[lokasi].tiket, 0)
  const daftarTahun = [tahunAktif - 2, tahunAktif - 1, tahunAktif, tahunAktif + 1]

  return (
    <div className="print-container h-[100dvh] w-full bg-gray-100 p-3 md:p-6 print:p-0 print:bg-white flex flex-col overflow-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body { background: white; margin: 0; }
          .print-hidden { display: none !important; }
          html, body { height: auto !important; overflow: visible !important; }
          .print-container { height: auto !important; overflow: visible !important; display: block !important; padding: 0 !important; background: #fff !important; }
          tr { page-break-inside: avoid; }
          table { page-break-inside: auto; font-size: 10px; }
          th, td { padding: 2px 4px !important; }
        }
      `}} />

      <div className="w-full max-w-[1400px] mx-auto flex flex-col h-full">

        <div className="flex justify-between items-start mb-3 bg-white p-3 rounded shadow-sm border border-gray-200 print-hidden flex-shrink-0">
          <div>
            <h1 className="text-sm md:text-xl font-bold text-gray-900 leading-tight">Laporan Gabungan Bulanan</h1>
            <p className="text-[10px] md:text-sm font-bold text-purple-600 mt-0.5">{labelBulan(bulanAktif)}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1.5 md:px-4 md:py-2 rounded text-[10px] md:text-sm font-bold transition shadow-sm">🖨️ Cetak</button>
            <button onClick={() => router.push('/laporan-penjualan-admin?menu=gabungan')} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1.5 md:px-4 md:py-2 rounded text-[10px] md:text-sm font-bold transition">Kembali</button>
          </div>
        </div>

        <div className="bg-white p-2 md:p-3 rounded shadow mb-3 flex flex-wrap items-center gap-2 print-hidden flex-shrink-0">
          <label className="text-[10px] md:text-sm font-medium text-gray-700">Periode:</label>
          <select value={nomorBulanAktif} onChange={(e) => handleGantiBulan(Number(e.target.value), tahunAktif)} className="border rounded px-2 py-1 text-[10px] md:text-sm text-gray-900 bg-white">
            {NAMA_BULAN.map((nama, idx) => (
              <option key={nama} value={idx + 1}>{nama}</option>
            ))}
          </select>
          <select value={tahunAktif} onChange={(e) => handleGantiBulan(nomorBulanAktif, Number(e.target.value))} className="border rounded px-2 py-1 text-[10px] md:text-sm text-gray-900 bg-white">
            {daftarTahun.map((tahun) => (
              <option key={tahun} value={tahun}>{tahun}</option>
            ))}
          </select>
          <span className="text-[10px] md:text-xs text-gray-500 ml-auto">
            Total sebulan: <span className="font-bold text-gray-900">{formatRupiah(grandTotal)}</span> &bull; <span className="text-gray-700">{lokasiList.length} daerah</span>
          </span>
        </div>

        <div className="print-hidden bg-white rounded shadow border border-gray-200 overflow-hidden flex-1 flex flex-col min-h-0">
          <div className="overflow-auto flex-1">
            <table className="w-full border-collapse text-gray-900">
              <thead className="bg-gray-100 border-b sticky top-0 z-10">
                <tr>
                  <th className="border p-1 text-[9px] md:text-xs text-center whitespace-nowrap" rowSpan={2}>Tanggal</th>
                  {lokasiList.map((lokasi) => (
                    <th key={lokasi} colSpan={3} className="border p-1 text-[9px] md:text-xs text-center whitespace-nowrap">{lokasi}</th>
                  ))}
                  <th className="border p-1 text-[9px] md:text-xs text-center whitespace-nowrap" rowSpan={2}>Total</th>
                </tr>
                <tr className="bg-gray-100">
                  {lokasiList.map((lokasi) => (
                    <Fragment key={lokasi}>
                      <th className="border p-1 text-[8px] md:text-xs text-center">Kursi</th>
                      <th className="border p-1 text-[8px] md:text-xs text-center">Tiket</th>
                      <th className="border p-1 text-[8px] md:text-xs text-center">Aksi</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {baris.map((b) => (
                  <tr key={b.tanggal} className="hover:bg-gray-50 text-center">
                    <td className="border p-1 text-[9px] md:text-xs font-bold whitespace-nowrap">{formatTanggalPendek(b.tanggal)}</td>
                    {lokasiList.map((lokasi) => {
                      const sel = b.perLokasi[lokasi] || selKosong()
                      return (
                        <Fragment key={lokasi}>
                          <td className={`border p-1 text-[9px] md:text-xs font-bold ${sel.kursi > 0 ? 'text-blue-600' : 'text-gray-400'}`}>{sel.kursi}</td>
                          <td className={`border p-1 text-[9px] md:text-xs text-right whitespace-nowrap ${sel.tiket > 0 ? '' : 'text-gray-400'}`}>{formatRupiah(sel.tiket)}</td>
                          <td className="border p-1">
                            <button onClick={() => bukaRinci(lokasi, b.tanggal)} className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-0.5 rounded text-[9px] md:text-xs font-bold">Rinci</button>
                          </td>
                        </Fragment>
                      )
                    })}
                    <td className={`border p-1 text-[9px] md:text-xs font-bold text-right whitespace-nowrap ${totalBaris(b) > 0 ? 'text-blue-700' : 'text-gray-400'}`}>{formatRupiah(totalBaris(b))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-blue-600 text-white font-bold text-center sticky bottom-0 z-10">
                <tr>
                  <td className="p-1 border text-[9px] md:text-xs">TOTAL</td>
                  {lokasiList.map((lokasi) => (
                    <Fragment key={lokasi}>
                      <td className="p-1 border text-[9px] md:text-xs">{totalPerLokasi[lokasi].kursi}</td>
                      <td className="p-1 border text-[9px] md:text-xs text-right whitespace-nowrap">{formatRupiah(totalPerLokasi[lokasi].tiket)}</td>
                      <td className="p-1 border text-[9px] md:text-xs">-</td>
                    </Fragment>
                  ))}
                  <td className="p-1 border text-[9px] md:text-xs text-right whitespace-nowrap">{formatRupiah(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="hidden print:block">
          <h1 className="text-xl font-bold text-center mb-4">LAPORAN GABUNGAN BULANAN</h1>
          <div className="mb-3 text-sm grid grid-cols-[90px_10px_1fr] gap-y-1">
            <span>Periode</span><span>:</span><span>{labelBulan(bulanAktif)}</span>
            <span>Petugas</span><span>:</span><span>{profile.nama || profile.email}</span>
            <span>Dicetak</span><span>:</span><span>{tanggalCetakSekarang()}</span>
          </div>
          <table className="w-full border-collapse border border-gray-400">
            <thead>
              <tr className="bg-gray-200 text-center text-gray-900">
                <th className="border border-gray-400 px-1 py-1" rowSpan={2}>Tanggal</th>
                {lokasiList.map((lokasi) => (
                  <th key={lokasi} colSpan={2} className="border border-gray-400 px-1 py-1">{lokasi}</th>
                ))}
                <th className="border border-gray-400 px-1 py-1" rowSpan={2}>Total</th>
              </tr>
              <tr className="bg-gray-200 text-center text-gray-900">
                {lokasiList.map((lokasi) => (
                  <Fragment key={lokasi}>
                    <th className="border border-gray-400 px-1 py-1">Kursi</th>
                    <th className="border border-gray-400 px-1 py-1">Tiket</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {baris.map((b) => (
                <tr key={b.tanggal} className="text-center text-gray-900">
                  <td className="border border-gray-400 px-1 py-0.5 whitespace-nowrap">{formatTanggalPendek(b.tanggal)}</td>
                  {lokasiList.map((lokasi) => {
                    const sel = b.perLokasi[lokasi] || selKosong()
                    return (
                      <Fragment key={lokasi}>
                        <td className="border border-gray-400 px-1 py-0.5">{sel.kursi}</td>
                        <td className="border border-gray-400 px-1 py-0.5 text-right whitespace-nowrap">{formatRupiah(sel.tiket)}</td>
                      </Fragment>
                    )
                  })}
                  <td className="border border-gray-400 px-1 py-0.5 text-right font-bold whitespace-nowrap">{formatRupiah(totalBaris(b))}</td>
                </tr>
              ))}
              <tr className="font-bold bg-gray-300 text-center text-gray-900">
                <td className="border border-gray-400 px-1 py-1">TOTAL</td>
                {lokasiList.map((lokasi) => (
                  <Fragment key={lokasi}>
                    <td className="border border-gray-400 px-1 py-1">{totalPerLokasi[lokasi].kursi}</td>
                    <td className="border border-gray-400 px-1 py-1 text-right whitespace-nowrap">{formatRupiah(totalPerLokasi[lokasi].tiket)}</td>
                  </Fragment>
                ))}
                <td className="border border-gray-400 px-1 py-1 text-right whitespace-nowrap">{formatRupiah(grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}

export default function LaporanGabunganBulananPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>}>
      <LaporanGabunganBulananContent />
    </Suspense>
  )
}

