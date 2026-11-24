'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Profile } from '@/lib/supabase'
import { formatRupiah } from '@/lib/periode'
import {
  formatPersen,
  labelTanggal,
  muatAnalisaPenjualanHarian,
  tanggalWITA,
  type BlokDaerahAnalisa,
  type HasilHarianAnalisa
} from '@/lib/analisaPenjualan'

function tanggalValid(tanggal: string | null): tanggal is string {
  if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return false
  return !Number.isNaN(new Date(`${tanggal}T00:00:00Z`).getTime())
}

function kategoriTampil(blok: BlokDaerahAnalisa) {
  return blok.kategori.filter(
    (item) => item.penjualan > 0 || ['online', 'agen', 'keberangkatan'].includes(item.key)
  )
}

function urutPenjualan(blok: BlokDaerahAnalisa) {
  return [...kategoriTampil(blok)].sort(
    (a, b) => b.penjualan - a.penjualan || a.label.localeCompare(b.label)
  )
}

export default function LaporanAnalisaPenjualanHarian({ profile }: { profile: Profile }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tanggalParam = searchParams.get('tanggal')
  const [tanggal, setTanggal] = useState(() =>
    tanggalValid(tanggalParam) ? tanggalParam : tanggalWITA()
  )
  const [hasil, setHasil] = useState<HasilHarianAnalisa | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let masihAktif = true
    async function muat() {
      setLoading(true)
      setError('')
      const data = await muatAnalisaPenjualanHarian({ profile, tanggal })
      if (!masihAktif) return
      setHasil(data)
      setError(data.error || '')
      setLoading(false)
    }
    muat()
    return () => { masihAktif = false }
  }, [profile, tanggal])

  const handlePrint = () => setTimeout(() => window.print(), 100)

  const gantiTanggal = (nilai: string) => {
    if (!nilai) return
    setTanggal(nilai)
    router.replace(`/laporan-analisa?menu=penjualan-harian&tanggal=${nilai}`)
  }

  return (
    <div className="min-h-screen bg-gray-100 p-3 md:p-6 print:bg-white print:p-0">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body { background: white; margin: 0; }
          .print-hidden { display: none !important; }
          .print-container { padding: 0 !important; background: #fff !important; }
          .blok-daerah { break-inside: avoid; page-break-inside: avoid; box-shadow: none !important; }
          table { font-size: 10px; }
          th, td { padding: 3px 5px !important; }
          tr { page-break-inside: avoid; }
        }
      `}} />

      <div className="print-container max-w-5xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4 print-hidden">
          <div className="flex flex-wrap justify-between items-start gap-3">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">Laporan Analisa Penjualan Harian</h1>
              <p className="text-xs md:text-sm text-gray-600 mt-0.5">
                Perbandingan penjualan online, agen, dan petugas untuk setiap daerah.
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
            <label className="text-xs md:text-sm font-medium text-gray-700">Tanggal:</label>
            <input
              type="date"
              value={tanggal}
              onChange={(e) => gantiTanggal(e.target.value)}
              className="border rounded px-2 py-1 text-xs md:text-sm text-gray-900"
            />
            <span className="text-xs text-gray-500 ml-auto">
              Total: <b className="text-gray-900">{formatRupiah(hasil?.total || 0)}</b>
              {' • '}
              {hasil?.daerah.length || 0} daerah
            </span>
          </div>
        </div>

        <div className="hidden print:block text-center mb-4">
          <h1 className="text-xl font-bold text-gray-900">LAPORAN ANALISA PENJUALAN PER HARI</h1>
          <p className="text-sm text-gray-700 mt-1">Tanggal : {labelTanggal(tanggal)}</p>
        </div>

        {loading ? (
          <p className="p-6 text-center text-gray-600">Memuat laporan...</p>
        ) : error ? (
          <p className="p-6 text-center text-red-600">{error}</p>
        ) : !hasil || hasil.daerah.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center">
            <p className="text-sm text-gray-600">Belum ada rute/penjualan pada tanggal ini.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {hasil.daerah.map((blok) => {
              const urut = urutPenjualan(blok)
              const tertinggi = blok.total > 0 ? urut[0] : null
              const terendah = blok.total > 0 ? urut[urut.length - 1] : null
              return (
                <section key={blok.daerah} className="blok-daerah bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 border-b bg-gray-50">
                    <p className="text-[10px] md:text-xs font-bold uppercase tracking-wide text-blue-700">
                      Laporan Analisa Penjualan per Hari
                    </p>
                    <h2 className="text-base md:text-lg font-bold text-gray-900 mt-0.5">Daerah : {blok.daerah}</h2>
                    <p className="text-[11px] md:text-xs text-gray-600">Tanggal : {labelTanggal(tanggal)}</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-gray-900">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="border p-2 text-[10px] md:text-xs text-left">Petugas</th>
                          <th className="border p-2 text-[10px] md:text-xs text-right">Penjualan</th>
                          <th className="border p-2 text-[10px] md:text-xs text-right">Persentase</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {kategoriTampil(blok).map((kategori) => (
                          <tr key={kategori.key} className={kategori.penjualan === 0 ? 'text-gray-400' : ''}>
                            <td className="border p-2 text-xs md:text-sm font-bold">{kategori.label}</td>
                            <td className="border p-2 text-xs md:text-sm text-right whitespace-nowrap">{formatRupiah(kategori.penjualan)}</td>
                            <td className="border p-2 text-xs md:text-sm text-right font-bold">{formatPersen(kategori.persentase)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-blue-600 text-white font-bold">
                        <tr>
                          <td className="border p-2 text-xs md:text-sm">TOTAL</td>
                          <td className="border p-2 text-xs md:text-sm text-right whitespace-nowrap">{formatRupiah(blok.total)}</td>
                          <td className="border p-2 text-xs md:text-sm text-right">100%</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {tertinggi && terendah && (
                    <div className="px-4 py-2 border-t bg-gray-50 flex flex-wrap gap-x-5 gap-y-1 text-[10px] md:text-xs">
                      <span className="text-green-700">Tertinggi: <b>{tertinggi.label}</b> ({formatRupiah(tertinggi.penjualan)})</span>
                      <span className="text-red-700">Terendah: <b>{terendah.label}</b> ({formatRupiah(terendah.penjualan)})</span>
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
