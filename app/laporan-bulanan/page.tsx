'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'
import { idOperator, ambilOperatorKapal, cocokOperator } from '@/lib/tenant'
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

type BarisBulanan = {
  tanggal: string
  kursi: number
  tiket: number
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

const BARIS_CETAK_PER_HALAMAN = 22

function LaporanBulananContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const lokasiParam = searchParams.get('lokasi') || ''
  const bulanParam = searchParams.get('bulan')

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [baris, setBaris] = useState<BarisBulanan[]>([])
  const [tujuanRute, setTujuanRute] = useState('')

  const bulanAktif = parseBulan(bulanParam) ? (bulanParam as string) : bulanSekarang()
  const infoBulan = parseBulan(bulanAktif)
  const tahunAktif = infoBulan ? infoBulan.tahun : new Date().getFullYear()
  const nomorBulanAktif = infoBulan ? infoBulan.bulan : new Date().getMonth() + 1

  // Rute diambil dari data penjualan itu sendiri, bukan nama daerah bawaan.
  const ruteLengkap = tujuanRute ? `${lokasiParam} - ${tujuanRute}` : (lokasiParam || '-')
  const menuKembali = lokasiParam ? `kota:${encodeURIComponent(lokasiParam)}` : ''

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

      if (!lokasiParam) {
        setBaris([])
        setTujuanRute('')
        setLoading(false)
        return
      }

      const tanggalList = daftarTanggalBulan(bulanAktif)
      // KUNCI MULTI-TENANT: operator hanya boleh melihat data miliknya sendiri
      const operatorId = idOperator(profile)

      const { data, error: errPesanan } = await supabase
        .from('pesanan')
        .select('id, is_balita, induk_id, jadwal:jadwal_id(rute_asal, rute_tujuan, harga, tanggal, kapal_id, operator_id)')
        .eq('status', 'paid')
        .eq('jadwal.rute_asal', lokasiParam)
        .gte('jadwal.tanggal', tanggalList[0])
        .lte('jadwal.tanggal', tanggalList[tanggalList.length - 1])

      if (errPesanan) {
        setError('Gagal memuat data: ' + errPesanan.message)
        setBaris([])
        setLoading(false)
        return
      }

      // Pemilik data lama ditentukan dari kapal (jadwal.operator_id bisa NULL).
      const petaOperatorKapal = await ambilOperatorKapal(
        (data || []).map((item: any) => item.jadwal?.kapal_id)
      )

      const mapTanggal: { [tanggal: string]: BarisBulanan } = {}
      tanggalList.forEach((t) => { mapTanggal[t] = { tanggal: t, kursi: 0, tiket: 0 } })
      const kumpulanTujuan = new Set<string>()

      ;(data || []).forEach((item: any) => {
        const jadwal = item.jadwal
        if (!jadwal || !jadwal.tanggal) return
        if (!cocokOperator(jadwal, operatorId, petaOperatorKapal)) return

        if (jadwal.rute_tujuan) kumpulanTujuan.add(jadwal.rute_tujuan)

        if (!mapTanggal[jadwal.tanggal]) {
          mapTanggal[jadwal.tanggal] = { tanggal: jadwal.tanggal, kursi: 0, tiket: 0 }
        }

        // 1 tiket = 1 barcode = 1 kursi. Balita yang menempel di tiket orang tua
        // (induk_id) tidak menambah kursi. Baris BALITA- lama tetap dihitung 1 kursi.
        if (!(item.is_balita && item.induk_id)) {
          mapTanggal[jadwal.tanggal].kursi += 1
        }
        mapTanggal[jadwal.tanggal].tiket += item.is_balita ? 0 : (jadwal.harga || 0)
      })

      setBaris(tanggalList.map((t) => mapTanggal[t]))
      setTujuanRute(Array.from(kumpulanTujuan).join(' / '))
      setLoading(false)
    }
    fetchData()
  }, [profile, bulanAktif, lokasiParam])

  const handleGantiBulan = (nomorBulan: number, tahun: number) => {
    const bulanBaru = `${tahun}-${String(nomorBulan).padStart(2, '0')}`
    router.replace(`/laporan-bulanan?lokasi=${encodeURIComponent(lokasiParam)}&bulan=${bulanBaru}`)
  }

  const handlePrint = () => setTimeout(() => window.print(), 100)

  const bukaPerincian = (tanggal: string) => {
    router.push(`/laporan?view=penjualan&lokasi=${encodeURIComponent(lokasiParam)}&tanggal=${tanggal}`)
  }

  if (!lokasiParam) return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center max-w-md">
        <p className="text-sm text-gray-600 mb-4">Pilih lokasi keberangkatan dulu dari halaman Laporan Penjualan.</p>
        <button onClick={() => router.push('/laporan-penjualan-admin')} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-bold transition">
          Buka Laporan Penjualan
        </button>
      </div>
    </div>
  )

  if (loading) return <p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>
  if (error) return <p className="p-6 text-center text-red-600 mt-10">{error}</p>
  if (!profile) return null

  const totalKursi = baris.reduce((sum, b) => sum + b.kursi, 0)
  const totalTiket = baris.reduce((sum, b) => sum + b.tiket, 0)
  const daftarTahun = [tahunAktif - 2, tahunAktif - 1, tahunAktif, tahunAktif + 1]

  // Satu lembar cetak = satu halaman; nomor halaman ditulis manual di bawah.
  const halamanCetak = bagiHalaman(baris, BARIS_CETAK_PER_HALAMAN)
  const tanggalCetak = tanggalCetakSekarang()

  return (
    <div className="print-container h-[100dvh] w-full bg-gray-100 p-3 md:p-6 print:p-0 print:bg-white flex flex-col overflow-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { size: A4; margin: 15mm; }
          body { background: white; margin: 0; }
          .print-hidden { display: none !important; }
          html, body { height: auto !important; overflow: visible !important; }
          .print-container { height: auto !important; overflow: visible !important; display: block !important; padding: 0 !important; background: #fff !important; }
          .lembar { position: relative; page-break-after: always; break-after: page; box-sizing: border-box; }
          .lembar:last-child { page-break-after: auto; break-after: auto; }
          .lembar-bulanan { min-height: 267mm; }
          .nomor-halaman { position: absolute; bottom: 0; left: 0; right: 0; text-align: center; font-size: 11px; font-weight: bold; color: #000; }
          thead { display: table-header-group; }
          tr, td, th { page-break-inside: avoid; break-inside: avoid; }
        }
      `}} />

      <div className="max-w-4xl w-full mx-auto flex flex-col h-full">

        <div className="flex justify-between items-start mb-3 bg-white p-3 rounded shadow-sm border border-gray-200 print-hidden flex-shrink-0">
          <div>
            <h1 className="text-sm md:text-xl font-bold text-gray-900 leading-tight">Laporan Penjualan Bulanan</h1>
            <p className="text-[10px] md:text-sm font-bold text-blue-600 mt-0.5">{ruteLengkap} &bull; {labelBulan(bulanAktif)}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1.5 md:px-4 md:py-2 rounded text-[10px] md:text-sm font-bold transition shadow-sm">🖨️ Cetak</button>
            <button onClick={() => router.push(menuKembali ? `/laporan-penjualan-admin?menu=${menuKembali}` : '/laporan-penjualan-admin')} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1.5 md:px-4 md:py-2 rounded text-[10px] md:text-sm font-bold transition">Kembali</button>
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
            Total sebulan: <span className="font-bold text-gray-900">{totalKursi} kursi</span> &bull; <span className="font-bold text-gray-900">{formatRupiah(totalTiket)}</span>
          </span>
        </div>

        <div className="print-hidden bg-white rounded shadow border border-gray-200 overflow-hidden flex-1 flex flex-col min-h-0">
          <div className="overflow-y-auto flex-1">
            <table className="w-full table-fixed border-collapse text-gray-900">
              <thead className="bg-gray-100 border-b sticky top-0 z-10">
                <tr>
                  <th className="border p-1 text-[9px] md:text-xs w-[22%] text-center" rowSpan={2}>Tanggal</th>
                  <th className="border p-1 text-[9px] md:text-xs text-center" colSpan={2}>Total Penjualan</th>
                  <th className="border p-1 text-[9px] md:text-xs w-[18%] text-center" rowSpan={2}>Aksi</th>
                </tr>
                <tr className="bg-gray-100">
                  <th className="border p-1 text-[8px] md:text-xs w-[15%] text-center">Kursi</th>
                  <th className="border p-1 text-[8px] md:text-xs text-center">Tiket</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {baris.map((b) => (
                  <tr key={b.tanggal} className="hover:bg-gray-50 text-center">
                    <td className="border p-1 text-[9px] md:text-xs font-bold">{formatTanggalPendek(b.tanggal)}</td>
                    <td className={`border p-1 text-[9px] md:text-xs font-bold ${b.kursi > 0 ? 'text-blue-600' : 'text-gray-400'}`}>{b.kursi}</td>
                    <td className={`border p-1 text-[9px] md:text-xs text-right ${b.tiket > 0 ? '' : 'text-gray-400'}`}>{formatRupiah(b.tiket)}</td>
                    <td className="border p-1">
                      <button onClick={() => bukaPerincian(b.tanggal)} className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-0.5 rounded text-[9px] md:text-xs font-bold">Perincian</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-blue-600 text-white font-bold text-center sticky bottom-0 z-10">
                <tr>
                  <td className="p-1 border text-[9px] md:text-xs">TOTAL</td>
                  <td className="p-1 border text-[9px] md:text-xs">{totalKursi}</td>
                  <td className="p-1 border text-[9px] md:text-xs text-right">{formatRupiah(totalTiket)}</td>
                  <td className="p-1 border text-[9px] md:text-xs">-</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="hidden print:block">
          {halamanCetak.map((daftarCetak, idxHalaman) => {
            const halamanTerakhir = idxHalaman === halamanCetak.length - 1
            return (
              <section key={`bulanan-${idxHalaman}`} className="lembar lembar-bulanan">
                <h1 className="text-xl font-bold text-center mb-6">LAPORAN REKAPAN BULANAN</h1>
                <div className="mb-4 text-sm grid grid-cols-[110px_10px_1fr] gap-y-1 text-gray-900">
                  <span>Rute</span><span>:</span><span>{ruteLengkap}</span>
                  <span>Periode</span><span>:</span><span>{labelBulan(bulanAktif)}</span>
                  <span>Dicetak</span><span>:</span><span>{tanggalCetak}</span>
                </div>
                <table className="w-full text-sm border-collapse border border-gray-400">
                  <thead>
                    <tr className="bg-gray-200 text-center text-gray-900">
                      <th className="border border-gray-400 px-2 py-1" rowSpan={2}>Tanggal</th>
                      <th className="border border-gray-400 px-2 py-1" colSpan={2}>Total Penjualan</th>
                    </tr>
                    <tr className="bg-gray-200 text-center text-gray-900">
                      <th className="border border-gray-400 px-2 py-1">Kursi</th>
                      <th className="border border-gray-400 px-2 py-1">Tiket</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daftarCetak.map((b) => (
                      <tr key={b.tanggal} className="text-center text-gray-900">
                        <td className="border border-gray-400 px-2 py-1">{formatTanggalPendek(b.tanggal)}</td>
                        <td className="border border-gray-400 px-2 py-1">{b.kursi}</td>
                        <td className="border border-gray-400 px-2 py-1 text-right">{formatRupiah(b.tiket)}</td>
                      </tr>
                    ))}
                    {halamanTerakhir && (
                      <tr className="font-bold bg-gray-300 text-center text-gray-900">
                        <td className="border border-gray-400 px-2 py-1">TOTAL</td>
                        <td className="border border-gray-400 px-2 py-1">{totalKursi}</td>
                        <td className="border border-gray-400 px-2 py-1 text-right">{formatRupiah(totalTiket)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div className="nomor-halaman">Halaman {idxHalaman + 1} dari {halamanCetak.length}</div>
              </section>
            )
          })}
        </div>

      </div>
    </div>
  )
}

export default function LaporanBulananPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>}>
      <LaporanBulananContent />
    </Suspense>
  )
}
