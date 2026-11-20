'use client'

// app/dashboard-superadmin/penerimaan-fee/bulanan/page.tsx
// Fee Platform bulanan: semua penjualan offline dari semua penyewa,
// dikelompokkan per penyewa + tanggal + kapal.
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { muatLaporanFeePlatform, type HasilLaporanPlatform } from '@/lib/laporanFee'
import { NAMA_BULAN, bulanSekarang, formatRupiah, formatTanggalPendek, labelBulan, parseBulan } from '@/lib/periode'

function FeePlatformBulananContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const bulanParam = searchParams.get('bulan') || ''
  const bulanAktif = parseBulan(bulanParam) ? bulanParam : bulanSekarang()
  const infoBulan = parseBulan(bulanAktif)
  const tahunAktif = infoBulan ? infoBulan.tahun : new Date().getFullYear()
  const nomorBulanAktif = infoBulan ? infoBulan.bulan : new Date().getMonth() + 1

  const [siap, setSiap] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasil, setHasil] = useState<HasilLaporanPlatform | null>(null)

  useEffect(() => {
    async function cekAkses() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/superadmin'); return }
      const { data: p } = await supabase.from('profiles').select('id, role').eq('id', user.id).maybeSingle()
      if (!p || (p.role || '').trim().toLowerCase() !== 'superadmin') {
        setError('Akses ditolak. Halaman ini khusus Superadmin.')
        setLoading(false)
        return
      }
      setSiap(true)
    }
    cekAkses()
  }, [router])

  useEffect(() => {
    async function fetchData() {
      if (!siap) return
      setLoading(true)
      setError('')
      const data = await muatLaporanFeePlatform({ mode: 'bulanan', bulan: bulanAktif })
      if (data.error) setError(data.error)
      setHasil(data.error ? null : data)
      setLoading(false)
    }
    fetchData()
  }, [siap, bulanAktif])

  const gantiBulan = (nomorBulan: number, tahun: number) => {
    const bulanBaru = `${tahun}-${String(nomorBulan).padStart(2, '0')}`
    router.replace(`/dashboard-superadmin/penerimaan-fee/bulanan?bulan=${bulanBaru}`)
  }

  if (loading && !hasil) return <p className="p-6 text-center text-gray-400 bg-gray-900 min-h-screen">Memuat...</p>
  if (error) return <p className="p-6 text-center text-red-500 bg-gray-900 min-h-screen">{error}</p>

  const daftarTahun = [tahunAktif - 2, tahunAktif - 1, tahunAktif, tahunAktif + 1]

  return (
    <div className="min-h-screen bg-gray-900 p-4 md:p-6 text-white print:bg-white print:p-0">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: white !important; color: black !important; }
          .print-hidden { display: none !important; }
          .kartu-cetak { background: white !important; color: black !important; border-color: #ddd !important; }
          tr { page-break-inside: avoid; }
        }
      `}} />

      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-start gap-2 mb-4 bg-red-950 border border-red-800 p-4 rounded-xl print-hidden">
          <div>
            <h1 className="text-xl font-bold">Fee Platform Bulanan</h1>
            <p className="text-sm text-red-200">{labelBulan(bulanAktif)} &bull; semua penyewa</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setTimeout(() => window.print(), 100)} className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-sm font-bold">🖨️ Cetak</button>
            <button onClick={() => router.push('/dashboard-superadmin/penerimaan-fee')} className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded text-sm font-bold border border-gray-700">Kembali</button>
          </div>
        </div>

        <div className="bg-gray-800 border border-gray-700 p-3 rounded mb-4 flex flex-wrap items-center gap-3 print-hidden">
          <label className="text-sm font-medium text-gray-300">Periode:</label>
          <select value={nomorBulanAktif} onChange={(e) => gantiBulan(Number(e.target.value), tahunAktif)} className="border border-gray-600 bg-gray-900 text-white rounded px-2 py-1 text-sm">
            {NAMA_BULAN.map((nama, idx) => (
              <option key={nama} value={idx + 1}>{nama}</option>
            ))}
          </select>
          <select value={tahunAktif} onChange={(e) => gantiBulan(nomorBulanAktif, Number(e.target.value))} className="border border-gray-600 bg-gray-900 text-white rounded px-2 py-1 text-sm">
            {daftarTahun.map((tahun) => (
              <option key={tahun} value={tahun}>{tahun}</option>
            ))}
          </select>
          <span className="text-xs text-gray-400 ml-auto">Fee berlaku: {formatRupiah(hasil?.feeBerlaku || 0)} / tiket</span>
        </div>

        {(hasil?.blok.length || 0) === 0 && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 text-center">
            <p className="text-sm text-gray-300">Belum ada penjualan offline pada bulan ini.</p>
          </div>
        )}

        {(hasil?.blok || []).map((blok) => (
          <div key={blok.operatorId} className="kartu-cetak bg-gray-800 border border-red-800 rounded-xl mb-4 overflow-hidden">
            <div className="bg-red-950 px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 print:bg-white">
              <p className="text-sm font-bold text-white print:text-black">{blok.namaPenyewa}</p>
              <span className="text-xs text-red-200 print:text-gray-700">Penyewa</span>
              <span className="ml-auto text-xs font-bold text-red-200 print:text-black">
                {blok.tiket} tiket &bull; {formatRupiah(blok.total)}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] md:text-sm">
                <thead className="bg-gray-900 text-gray-300 print:bg-gray-100 print:text-black">
                  <tr>
                    <th className="px-2 py-1.5 text-center w-10">NO</th>
                    <th className="px-2 py-1.5 text-left">TGL</th>
                    <th className="px-2 py-1.5 text-left">KAPAL</th>
                    <th className="px-2 py-1.5 text-right">TIKET</th>
                    <th className="px-2 py-1.5 text-right">FEE</th>
                    <th className="px-2 py-1.5 text-right">TOTAL</th>
                    <th className="px-2 py-1.5 text-center print-hidden">AKSI</th>
                  </tr>
                </thead>
                <tbody>
                  {blok.baris.map((baris, idx) => (
                    <tr key={baris.kunci} className="border-t border-gray-700 print:border-gray-300">
                      <td className="px-2 py-1.5 text-center text-gray-400 print:text-gray-600">{idx + 1}</td>
                      <td className="px-2 py-1.5 font-medium text-white print:text-black">{formatTanggalPendek(baris.tanggal)}</td>
                      <td className="px-2 py-1.5 text-white print:text-black">{baris.kapal}</td>
                      <td className="px-2 py-1.5 text-right text-white print:text-black">{baris.tiket}</td>
                      <td className="px-2 py-1.5 text-right text-gray-300 print:text-gray-700">{formatRupiah(baris.fee)}</td>
                      <td className="px-2 py-1.5 text-right font-bold text-white print:text-black">{formatRupiah(baris.total)}</td>
                      <td className="px-2 py-1.5 text-center print-hidden">
                        <button
                          onClick={() => router.push(`/dashboard-superadmin/penerimaan-fee/harian?tanggal=${baris.tanggal}`)}
                          className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-[10px] md:text-xs font-bold"
                        >
                          RINCI
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-red-800 bg-red-950/40 print:bg-gray-100">
                    <td colSpan={3} className="px-2 py-1.5 text-right font-bold text-white print:text-black">Subtotal</td>
                    <td className="px-2 py-1.5 text-right font-bold text-white print:text-black">{blok.tiket}</td>
                    <td className="px-2 py-1.5"></td>
                    <td className="px-2 py-1.5 text-right font-bold text-red-300 print:text-black">{formatRupiah(blok.total)}</td>
                    <td className="print-hidden"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {(hasil?.blok.length || 0) > 0 && (
          <div className="kartu-cetak bg-gray-800 border border-red-800 rounded-xl p-3 flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-white print:text-black">TOTAL FEE PLATFORM</p>
            <p className="text-sm text-gray-300 print:text-gray-700">{hasil?.totalTiket || 0} tiket</p>
            <p className="ml-auto text-lg font-bold text-red-300 print:text-black">{formatRupiah(hasil?.totalFee || 0)}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function FeePlatformBulananPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-400 bg-gray-900 min-h-screen">Memuat...</p>}>
      <FeePlatformBulananContent />
    </Suspense>
  )
}
