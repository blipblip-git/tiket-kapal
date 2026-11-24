'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Profile } from '@/lib/supabase'
import { bulanSekarang, formatRupiah, labelBulan, parseBulan } from '@/lib/periode'
import {
  formatPersen,
  labelTanggal,
  muatAnalisaPenjualanKapal,
  tanggalWITA,
  type HasilKapalAnalisa
} from '@/lib/analisaPenjualan'

function tanggalValid(tanggal: string | null): tanggal is string {
  if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return false
  return !Number.isNaN(new Date(`${tanggal}T00:00:00Z`).getTime())
}

export default function LaporanAnalisaKapal({
  profile,
  mode
}: {
  profile: Profile
  mode: 'harian' | 'bulanan'
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tanggalParam = searchParams.get('tanggal')
  const bulanParam = searchParams.get('bulan')
  const [tanggal, setTanggal] = useState(() =>
    tanggalValid(tanggalParam) ? tanggalParam : tanggalWITA()
  )
  const [bulan, setBulan] = useState(() =>
    parseBulan(bulanParam) ? (bulanParam as string) : bulanSekarang()
  )
  const [hasil, setHasil] = useState<HasilKapalAnalisa | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let masihAktif = true
    async function muat() {
      setLoading(true)
      setError('')
      const data = mode === 'harian'
        ? await muatAnalisaPenjualanKapal({ profile, tanggal })
        : await muatAnalisaPenjualanKapal({ profile, bulan })
      if (!masihAktif) return
      setHasil(data)
      setError(data.error || '')
      setLoading(false)
    }
    muat()
    return () => { masihAktif = false }
  }, [profile, mode, tanggal, bulan])

  const handlePrint = () => setTimeout(() => window.print(), 100)

  const gantiTanggal = (nilai: string) => {
    if (!nilai) return
    setTanggal(nilai)
    router.replace(`/laporan-analisa?menu=kapal-harian&tanggal=${nilai}`)
  }

  const gantiBulan = (nilai: string) => {
    if (!parseBulan(nilai)) return
    setBulan(nilai)
    router.replace(`/laporan-analisa?menu=kapal-bulanan&bulan=${nilai}`)
  }

  const baris = hasil?.baris || []
  const total = hasil?.total || 0
  const tertinggi = baris.length > 0 ? baris[0] : null
  const terendah = baris.length > 0 ? baris[baris.length - 1] : null
  const judulMode = mode === 'harian' ? 'Harian' : 'Bulanan'

  return (
    <div className="min-h-screen bg-gray-100 p-3 md:p-6 print:bg-white print:p-0">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body { background: white; margin: 0; }
          .print-hidden { display: none !important; }
          .print-container { padding: 0 !important; background: #fff !important; }
          table { font-size: 10px; }
          th, td { padding: 3px 5px !important; }
          tr { page-break-inside: avoid; }
        }
      `}} />

      <div className="print-container max-w-5xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4 print-hidden">
          <div className="flex flex-wrap justify-between items-start gap-3">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">Laporan Analisa Penjualan Kapal {judulMode}</h1>
              <p className="text-xs md:text-sm text-gray-600 mt-0.5">
                Peringkat penjualan setiap kapal beserta kontribusinya.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-xs md:text-sm font-bold transition shadow-sm">
                🖨️ Cetak
              </button>
              <button onClick={() => router.push('/laporan-analisa?menu=kapal')} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded text-xs md:text-sm font-bold transition">
                &larr; Kembali
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-100">
            {mode === 'harian' ? (
              <>
                <label className="text-xs md:text-sm font-medium text-gray-700">Tanggal:</label>
                <input
                  type="date"
                  value={tanggal}
                  onChange={(e) => gantiTanggal(e.target.value)}
                  className="border rounded px-2 py-1 text-xs md:text-sm text-gray-900"
                />
              </>
            ) : (
              <>
                <label className="text-xs md:text-sm font-medium text-gray-700">Bulan:</label>
                <input
                  type="month"
                  value={bulan}
                  onChange={(e) => gantiBulan(e.target.value)}
                  className="border rounded px-2 py-1 text-xs md:text-sm text-gray-900"
                />
              </>
            )}
            <span className="text-xs text-gray-500 ml-auto">
              Total: <b className="text-gray-900">{formatRupiah(total)}</b>
              {' • '}
              {baris.length} kapal
            </span>
          </div>
        </div>

        <div className="hidden print:block text-center mb-4">
          <h1 className="text-xl font-bold text-gray-900">LAPORAN ANALISA PENJUALAN KAPAL PER {mode === 'harian' ? 'HARI' : 'BULAN'}</h1>
          <p className="text-sm text-gray-700 mt-1">
            {mode === 'harian' ? `Tanggal : ${labelTanggal(tanggal)}` : `Bulan : ${labelBulan(bulan)}`}
          </p>
        </div>

        {loading ? (
          <p className="p-6 text-center text-gray-600">Memuat laporan...</p>
        ) : error ? (
          <p className="p-6 text-center text-red-600">{error}</p>
        ) : baris.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center">
            <p className="text-sm text-gray-600">
              {mode === 'harian'
                ? 'Belum ada penjualan kapal pada tanggal ini.'
                : 'Belum ada penjualan kapal pada bulan ini.'}
            </p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-4 py-2.5 mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[10px] md:text-xs print:shadow-none">
              {tertinggi && (
                <span className="text-green-700">Tertinggi: <b>{tertinggi.nama}</b> ({formatRupiah(tertinggi.penjualan)})</span>
              )}
              {terendah && (
                <span className="text-red-700">Terendah: <b>{terendah.nama}</b> ({formatRupiah(terendah.penjualan)})</span>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto print:shadow-none">
              <table className="w-full min-w-[650px] border-collapse text-gray-900">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border p-2 text-[9px] md:text-xs text-center w-10">No</th>
                    <th className="border p-2 text-[9px] md:text-xs text-left">Kapal</th>
                    <th className="border p-2 text-[9px] md:text-xs text-left">Rute</th>
                    {mode === 'bulanan' && (
                      <th className="border p-2 text-[9px] md:text-xs text-center">Hari Operasi</th>
                    )}
                    <th className="border p-2 text-[9px] md:text-xs text-center">Tiket</th>
                    <th className="border p-2 text-[9px] md:text-xs text-right">Penjualan</th>
                    <th className="border p-2 text-[9px] md:text-xs text-right">Persentase</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {baris.map((kapal, idx) => (
                    <tr key={kapal.kapalId} className={idx === 0 ? 'bg-green-50' : idx === baris.length - 1 ? 'bg-red-50' : ''}>
                      <td className="border p-2 text-[9px] md:text-xs text-center font-bold">{idx + 1}</td>
                      <td className="border p-2 text-[9px] md:text-xs font-bold">{kapal.nama}</td>
                      <td className="border p-2 text-[9px] md:text-xs">{kapal.rute}</td>
                      {mode === 'bulanan' && (
                        <td className="border p-2 text-[9px] md:text-xs text-center">{kapal.hari}</td>
                      )}
                      <td className="border p-2 text-[9px] md:text-xs text-center">{kapal.tiket}</td>
                      <td className="border p-2 text-[9px] md:text-xs text-right whitespace-nowrap">{formatRupiah(kapal.penjualan)}</td>
                      <td className="border p-2 text-[9px] md:text-xs text-right font-bold">{formatPersen(kapal.persentase)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-blue-600 text-white font-bold">
                  <tr>
                    <td className="border p-2 text-[9px] md:text-xs text-center" colSpan={2}>TOTAL</td>
                    <td className="border p-2 text-[9px] md:text-xs">{baris.length} kapal</td>
                    {mode === 'bulanan' && <td className="border p-2 text-[9px] md:text-xs" />}
                    <td className="border p-2 text-[9px] md:text-xs text-center">{hasil?.totalTiket || 0}</td>
                    <td className="border p-2 text-[9px] md:text-xs text-right whitespace-nowrap">{formatRupiah(total)}</td>
                    <td className="border p-2 text-[9px] md:text-xs text-right">{total > 0 ? '100%' : '0%'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
