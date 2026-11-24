'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Profile } from '@/lib/supabase'
import { bulanSekarang, formatRupiah, labelBulan, parseBulan } from '@/lib/periode'
import {
  formatPersen,
  muatAnalisaPenjualanBulanan,
  type HasilBulananAnalisa
} from '@/lib/analisaPenjualan'

function kategoriTampil(hasil: HasilBulananAnalisa) {
  return hasil.kategori.filter(
    (item) => item.total > 0 || ['online', 'agen', 'keberangkatan'].includes(item.key)
  )
}

export default function LaporanAnalisaPenjualanBulanan({ profile }: { profile: Profile }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const bulanParam = searchParams.get('bulan')
  const [bulan, setBulan] = useState(() =>
    parseBulan(bulanParam) ? (bulanParam as string) : bulanSekarang()
  )
  const [hasil, setHasil] = useState<HasilBulananAnalisa | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let masihAktif = true
    async function muat() {
      setLoading(true)
      setError('')
      const data = await muatAnalisaPenjualanBulanan({ profile, bulan })
      if (!masihAktif) return
      setHasil(data)
      setError(data.error || '')
      setLoading(false)
    }
    muat()
    return () => { masihAktif = false }
  }, [profile, bulan])

  const handlePrint = () => setTimeout(() => window.print(), 100)

  const gantiBulan = (nilai: string) => {
    if (!parseBulan(nilai)) return
    setBulan(nilai)
    router.replace(`/laporan-analisa?menu=penjualan-bulanan&bulan=${nilai}`)
  }

  const totalPerDaerah = hasil?.totalPerDaerah || {}
  const grandTotal = hasil?.grandTotal || 0
  const daerah = hasil?.daerah || []
  const peringkat = [...daerah].sort(
    (a, b) => (totalPerDaerah[b] || 0) - (totalPerDaerah[a] || 0) || a.localeCompare(b)
  )
  const daerahTertinggi = grandTotal > 0 ? peringkat[0] : null
  const daerahTerendah = grandTotal > 0 ? peringkat[peringkat.length - 1] : null
  const kategoriUrut = hasil
    ? [...kategoriTampil(hasil)].sort(
        (a, b) => b.total - a.total || a.label.localeCompare(b.label)
      )
    : []
  const kategoriTertinggi = grandTotal > 0 ? kategoriUrut[0] : null
  const kategoriTerendah = grandTotal > 0 ? kategoriUrut[kategoriUrut.length - 1] : null

  return (
    <div className="min-h-screen bg-gray-100 p-3 md:p-6 print:bg-white print:p-0">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body { background: white; margin: 0; }
          .print-hidden { display: none !important; }
          .print-container { padding: 0 !important; background: #fff !important; max-width: none !important; }
          table { font-size: 9px; }
          th, td { padding: 2px 4px !important; }
          tr { page-break-inside: avoid; }
        }
      `}} />

      <div className="print-container max-w-[1400px] mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4 print-hidden">
          <div className="flex flex-wrap justify-between items-start gap-3">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">Laporan Analisa Penjualan Bulanan</h1>
              <p className="text-xs md:text-sm text-gray-600 mt-0.5">
                Perbandingan penjualan online, agen, dan petugas di semua daerah.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-xs md:text-sm font-bold transition shadow-sm">
                🖨️ Cetak
              </button>
              <button onClick={() => router.push('/laporan-analisa?menu=penjualan')} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded text-xs md:text-sm font-bold transition">
                &larr; Kembali
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-100">
            <label className="text-xs md:text-sm font-medium text-gray-700">Bulan:</label>
            <input
              type="month"
              value={bulan}
              onChange={(e) => gantiBulan(e.target.value)}
              className="border rounded px-2 py-1 text-xs md:text-sm text-gray-900"
            />
            <span className="text-xs text-gray-500 ml-auto">
              Total: <b className="text-gray-900">{formatRupiah(grandTotal)}</b>
              {' • '}
              {daerah.length} daerah
            </span>
          </div>
        </div>

        <div className="hidden print:block text-center mb-3">
          <h1 className="text-xl font-bold text-gray-900">LAPORAN ANALISA PENJUALAN PER BULAN</h1>
          <p className="text-sm text-gray-700 mt-1">Bulan : {labelBulan(bulan)}</p>
        </div>

        {loading ? (
          <p className="p-6 text-center text-gray-600">Memuat laporan...</p>
        ) : error ? (
          <p className="p-6 text-center text-red-600">{error}</p>
        ) : !hasil || daerah.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center">
            <p className="text-sm text-gray-600">Belum ada rute/penjualan pada bulan ini.</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-4 py-2.5 mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[10px] md:text-xs print:shadow-none">
              {daerahTertinggi && (
                <span className="text-green-700">Daerah tertinggi: <b>{daerahTertinggi}</b> ({formatRupiah(totalPerDaerah[daerahTertinggi] || 0)})</span>
              )}
              {daerahTerendah && (
                <span className="text-red-700">Daerah terendah: <b>{daerahTerendah}</b> ({formatRupiah(totalPerDaerah[daerahTerendah] || 0)})</span>
              )}
              {kategoriTertinggi && (
                <span className="text-blue-700">Jenis penjualan tertinggi: <b>{kategoriTertinggi.label}</b> ({formatRupiah(kategoriTertinggi.total)})</span>
              )}
              {kategoriTerendah && (
                <span className="text-orange-700">Jenis penjualan terendah: <b>{kategoriTerendah.label}</b> ({formatRupiah(kategoriTerendah.total)})</span>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto print:shadow-none">
              <table className="w-full min-w-[900px] border-collapse text-gray-900">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border p-2 text-[9px] md:text-xs text-left sticky left-0 bg-gray-100 z-10 min-w-[150px]">Petugas</th>
                    {daerah.map((nama) => (
                      <th key={nama} className="border p-2 text-[9px] md:text-xs text-center whitespace-nowrap min-w-[70px]">{nama}</th>
                    ))}
                    <th className="border p-2 text-[9px] md:text-xs text-right whitespace-nowrap min-w-[100px]">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {kategoriTampil(hasil).map((kategori) => (
                    <tr key={kategori.key} className={kategori.total === 0 ? 'text-gray-400' : ''}>
                      <td className="border p-2 text-[9px] md:text-xs font-bold sticky left-0 bg-white">{kategori.label}</td>
                      {daerah.map((nama) => (
                        <td key={nama} className="border p-2 text-[9px] md:text-xs text-right whitespace-nowrap">
                          {formatRupiah(kategori.perDaerah[nama] || 0)}
                        </td>
                      ))}
                      <td className="border p-2 text-[9px] md:text-xs text-right font-bold whitespace-nowrap">{formatRupiah(kategori.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="font-bold">
                  <tr className="bg-blue-600 text-white">
                    <td className="border p-2 text-[9px] md:text-xs sticky left-0 bg-blue-600">TOTAL</td>
                    {daerah.map((nama) => (
                      <td key={nama} className="border p-2 text-[9px] md:text-xs text-right whitespace-nowrap">{formatRupiah(totalPerDaerah[nama] || 0)}</td>
                    ))}
                    <td className="border p-2 text-[9px] md:text-xs text-right whitespace-nowrap">{formatRupiah(grandTotal)}</td>
                  </tr>
                  <tr className="bg-amber-100 text-gray-900">
                    <td className="border p-2 text-[9px] md:text-xs sticky left-0 bg-amber-100">%</td>
                    {daerah.map((nama) => (
                      <td key={nama} className="border p-2 text-[9px] md:text-xs text-right whitespace-nowrap">
                        {formatPersen(grandTotal > 0 ? ((totalPerDaerah[nama] || 0) / grandTotal) * 100 : 0)}
                      </td>
                    ))}
                    <td className="border p-2 text-[9px] md:text-xs text-right">{grandTotal > 0 ? '100%' : '0%'}</td>
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
