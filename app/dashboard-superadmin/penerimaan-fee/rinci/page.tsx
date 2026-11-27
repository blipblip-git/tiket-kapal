'use client'

// app/dashboard-superadmin/penerimaan-fee/rinci/page.tsx
// Rincian Fee Platform per jam/kapal: daftar PENJUAL (agen/petugas) + jumlah
// tiket. Tanpa nama penumpang (khusus Superadmin).
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { muatRincianPlatform, type RincianPlatform } from '@/lib/laporanFee'
import { formatRupiah, formatTanggalPendek } from '@/lib/periode'

function RinciPlatformContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tanggalParam = searchParams.get('tanggal') || ''
  const operatorParam = searchParams.get('operator') || ''
  const jamParam = searchParams.get('jam') || ''
  const kapalParam = searchParams.get('kapal') || ''
  const kanal: 'offline' | 'online' = searchParams.get('kanal') === 'online' ? 'online' : 'offline'

  const [siap, setSiap] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [baris, setBaris] = useState<RincianPlatform[]>([])

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
      if (!tanggalParam) {
        setError('Tanggal rincian tidak ditemukan.')
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')
      const hasil = await muatRincianPlatform({
        tanggal: tanggalParam,
        operatorId: operatorParam || undefined,
        jam: jamParam,
        kapal: kapalParam,
        kanal
      })
      if (hasil.error) {
        setError(hasil.error)
        setBaris([])
      } else {
        setBaris(hasil.baris)
      }
      setLoading(false)
    }
    fetchData()
  }, [siap, tanggalParam, operatorParam, jamParam, kapalParam, kanal])

  const kembali = () => router.push(`/dashboard-superadmin/penerimaan-fee/harian?tanggal=${tanggalParam}&kanal=${kanal}`)

  if (loading) return <p className="p-6 text-center text-gray-400 bg-gray-900 min-h-screen">Memuat...</p>
  if (error) return <p className="p-6 text-center text-red-500 bg-gray-900 min-h-screen">{error}</p>

  const totalTiket = baris.reduce((sum, b) => sum + b.tiket, 0)
  const totalFee = baris.reduce((sum, b) => sum + b.total, 0)

  return (
    <div className="min-h-screen bg-gray-900 p-4 md:p-6 text-white print:bg-white print:p-0">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: white !important; color: black !important; }
          .print-hidden { display: none !important; }
          tr { page-break-inside: avoid; }
        }
      `}} />

      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-start gap-2 mb-4 bg-red-950 border border-red-800 p-4 rounded-xl print-hidden">
          <div>
            <h1 className="text-xl font-bold">Rincian Fee Platform</h1>
            <p className="text-sm text-red-200">
              {jamParam || '-'} &bull; {kapalParam || '-'} &bull; {formatTanggalPendek(tanggalParam)}
            </p>
            <p className="text-[11px] text-red-200 mt-0.5">Daftar penjual (tanpa nama penumpang).</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setTimeout(() => window.print(), 100)} className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-sm font-bold">🖨️ Cetak</button>
            <button onClick={kembali} className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded text-sm font-bold border border-gray-700">Kembali</button>
          </div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] md:text-sm">
              <thead className="bg-gray-900 text-gray-300 print:bg-gray-100 print:text-black">
                <tr>
                  <th className="px-2 py-2 text-center w-10">NO</th>
                  <th className="px-2 py-2 text-left">JAM</th>
                  <th className="px-2 py-2 text-left">KAPAL</th>
                  <th className="px-2 py-2 text-left">PENJUAL</th>
                  <th className="px-2 py-2 text-right">TIKET</th>
                  <th className="px-2 py-2 text-right">FEE</th>
                  <th className="px-2 py-2 text-right">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {baris.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-2 py-6 text-center text-gray-400">Tidak ada penjualan pada jam ini.</td>
                  </tr>
                )}
                {baris.map((item, idx) => (
                  <tr key={`${item.jam}-${item.kapal}-${item.penjual}`} className="border-t border-gray-700 print:border-gray-300">
                    <td className="px-2 py-1.5 text-center text-gray-400 print:text-gray-600">{idx + 1}</td>
                    <td className="px-2 py-1.5 text-white print:text-black">{item.jam}</td>
                    <td className="px-2 py-1.5 text-white print:text-black">{item.kapal}</td>
                    <td className="px-2 py-1.5 text-white print:text-black">{item.penjual}</td>
                    <td className="px-2 py-1.5 text-right text-white print:text-black">{item.tiket}</td>
                    <td className="px-2 py-1.5 text-right text-gray-300 print:text-gray-700">{formatRupiah(item.fee)}</td>
                    <td className="px-2 py-1.5 text-right font-bold text-white print:text-black">{formatRupiah(item.total)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-red-800 bg-red-950/40 print:bg-gray-100">
                  <td colSpan={4} className="px-2 py-1.5 text-right font-bold text-white print:text-black">Total</td>
                  <td className="px-2 py-1.5 text-right font-bold text-white print:text-black">{totalTiket}</td>
                  <td className="px-2 py-1.5"></td>
                  <td className="px-2 py-1.5 text-right font-bold text-red-300 print:text-black">{formatRupiah(totalFee)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RinciPlatformPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-400 bg-gray-900 min-h-screen">Memuat...</p>}>
      <RinciPlatformContent />
    </Suspense>
  )
}
