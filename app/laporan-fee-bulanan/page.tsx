'use client'

// app/laporan-fee-bulanan/page.tsx
// Laporan Fee Bulanan: rekap fee agen per tanggal & kapal untuk satu daerah
// (semua agen tampil), atau khusus agen yang sedang login (?saya=1).
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getOperatorSession, getProfile, type Profile } from '@/lib/supabase'
import { muatLaporanFee, type HasilLaporanFee } from '@/lib/laporanFee'
import { kodeDaerah } from '@/lib/fee'
import { NAMA_BULAN, bulanSekarang, formatRupiah, formatTanggalPendek, labelBulan, parseBulan } from '@/lib/periode'

function LaporanFeeBulananContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const lokasiParam = searchParams.get('lokasi') || ''
  const bulanParam = searchParams.get('bulan') || ''
  const sayaParam = searchParams.get('saya') === '1'

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasil, setHasil] = useState<HasilLaporanFee | null>(null)

  const bulanAktif = parseBulan(bulanParam) ? bulanParam : bulanSekarang()
  const infoBulan = parseBulan(bulanAktif)
  const tahunAktif = infoBulan ? infoBulan.tahun : new Date().getFullYear()
  const nomorBulanAktif = infoBulan ? infoBulan.bulan : new Date().getMonth() + 1
  const sayaSendiri = sayaParam || profile?.role === 'agen'

  useEffect(() => {
    async function init() {
      let currentProfile = getOperatorSession()
      if (!currentProfile) currentProfile = await getProfile()
      if (!currentProfile) { router.push('/login'); return }

      const role = currentProfile.role
      if (role !== 'admin_utama' && role !== 'superadmin' && role !== 'agen') {
        setError('Anda tidak punya akses ke Laporan Fee.')
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

      const hasilData = await muatLaporanFee({
        profile,
        mode: 'bulanan',
        bulan: bulanAktif,
        lokasi: sayaSendiri ? '' : lokasiParam,
        sayaSendiri
      })

      if (hasilData.error) {
        setError(hasilData.error)
        setHasil(null)
      } else {
        setHasil(hasilData)
      }
      setLoading(false)
    }
    fetchData()
  }, [profile, bulanAktif, lokasiParam, sayaSendiri])

  const gantiBulan = (nomorBulan: number, tahun: number) => {
    const bulanBaru = `${tahun}-${String(nomorBulan).padStart(2, '0')}`
    const dasar = sayaSendiri ? '/laporan-fee-bulanan?saya=1' : `/laporan-fee-bulanan?lokasi=${encodeURIComponent(lokasiParam)}`
    router.replace(`${dasar}&bulan=${bulanBaru}`)
  }

  const menuKembali = sayaSendiri
    ? '/agen/laporan-fee'
    : `/laporan-penjualan-admin?menu=fee:agen:${encodeURIComponent(lokasiParam)}`

  if (loading && !hasil) return <p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>
  if (error) return <p className="p-6 text-center text-red-600 mt-10">{error}</p>
  if (!profile) return null

  const judulDaerah = sayaSendiri
    ? `${profile.nama} - ${profile.lokasi || '-'} / ${kodeDaerah(String(profile.lokasi || ''))}`
    : `${lokasiParam} / ${kodeDaerah(lokasiParam)}`
  const daftarTahun = [tahunAktif - 2, tahunAktif - 1, tahunAktif, tahunAktif + 1]

  return (
    <div className="print-container min-h-[100dvh] w-full bg-gray-100 p-3 md:p-6 print:p-0 print:bg-white">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: white; margin: 0; }
          .print-hidden { display: none !important; }
          tr { page-break-inside: avoid; }
        }
      `}} />

      <div className="max-w-5xl w-full mx-auto">
        <div className="flex justify-between items-start gap-2 mb-3 bg-white p-3 rounded shadow-sm border border-gray-200 print-hidden">
          <div>
            <h1 className="text-sm md:text-xl font-bold text-gray-900 leading-tight">Laporan Fee Bulanan</h1>
            <p className="text-[10px] md:text-sm font-bold text-red-600 mt-0.5">{judulDaerah} &bull; {labelBulan(bulanAktif)}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => setTimeout(() => window.print(), 100)} className="bg-red-600 hover:bg-red-700 text-white px-2 py-1.5 md:px-4 md:py-2 rounded text-[10px] md:text-sm font-bold transition shadow-sm">🖨️ Cetak</button>
            <button onClick={() => router.push(menuKembali)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1.5 md:px-4 md:py-2 rounded text-[10px] md:text-sm font-bold transition">Kembali</button>
          </div>
        </div>

        <div className="bg-white p-2 md:p-3 rounded shadow mb-3 flex flex-wrap items-center gap-2 print-hidden">
          <label className="text-[10px] md:text-sm font-medium text-gray-700">Periode:</label>
          <select value={nomorBulanAktif} onChange={(e) => gantiBulan(Number(e.target.value), tahunAktif)} className="border rounded px-2 py-1 text-[10px] md:text-sm text-gray-900 bg-white">
            {NAMA_BULAN.map((nama, idx) => (
              <option key={nama} value={idx + 1}>{nama}</option>
            ))}
          </select>
          <select value={tahunAktif} onChange={(e) => gantiBulan(nomorBulanAktif, Number(e.target.value))} className="border rounded px-2 py-1 text-[10px] md:text-sm text-gray-900 bg-white">
            {daftarTahun.map((tahun) => (
              <option key={tahun} value={tahun}>{tahun}</option>
            ))}
          </select>
          <span className="text-[10px] md:text-xs text-gray-500 ml-auto">
            Fee dihitung per tiket dewasa (balita gratis tidak kena fee).
          </span>
        </div>

        {(hasil?.blok.length || 0) === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <p className="text-sm text-gray-600">Belum ada penjualan agen pada bulan ini.</p>
          </div>
        )}

        {(hasil?.blok || []).map((blok) => (
          <div key={blok.penjual.id} className="bg-white rounded-xl shadow-sm border border-gray-200 mb-4 overflow-hidden">
            <div className="bg-red-50 border-b border-red-100 px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-xs md:text-sm font-bold text-gray-900">
                Agen : {blok.penjual.nama} - {blok.penjual.lokasi || '-'} / {blok.penjual.kode}
              </p>
              <span className="text-[10px] md:text-xs text-gray-600">Fee {formatRupiah(blok.penjual.fee)}/tiket</span>
              <span className="ml-auto text-[10px] md:text-xs font-bold text-gray-900">
                {blok.tiket} tiket &bull; {formatRupiah(blok.total)}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] md:text-sm">
                <thead className="bg-gray-50 text-gray-600">
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
                    <tr key={baris.kunci} className="border-t border-gray-100">
                      <td className="px-2 py-1.5 text-center text-gray-500">{idx + 1}</td>
                      <td className="px-2 py-1.5 font-medium text-gray-900">{formatTanggalPendek(baris.tanggal)}</td>
                      <td className="px-2 py-1.5 text-gray-900">{baris.kapal}</td>
                      <td className="px-2 py-1.5 text-right text-gray-900">{baris.tiket}</td>
                      <td className="px-2 py-1.5 text-right text-gray-700">{formatRupiah(baris.fee)}</td>
                      <td className="px-2 py-1.5 text-right font-bold text-gray-900">{formatRupiah(baris.total)}</td>
                      <td className="px-2 py-1.5 text-center print-hidden">
                        <button
                          onClick={() => router.push(`/laporan-fee-harian?${sayaSendiri ? 'saya=1&' : `lokasi=${encodeURIComponent(lokasiParam)}&`}tanggal=${baris.tanggal}`)}
                          className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-[10px] md:text-xs font-bold transition"
                        >
                          RINCI
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-red-100 bg-red-50/50">
                    <td colSpan={3} className="px-2 py-1.5 text-right font-bold text-gray-900">Subtotal</td>
                    <td className="px-2 py-1.5 text-right font-bold text-gray-900">{blok.tiket}</td>
                    <td className="px-2 py-1.5"></td>
                    <td className="px-2 py-1.5 text-right font-bold text-red-700">{formatRupiah(blok.total)}</td>
                    <td className="print-hidden"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {(hasil?.blok.length || 0) > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 flex flex-wrap items-center gap-2">
            <p className="text-xs md:text-sm font-bold text-gray-900">TOTAL SEMUA AGEN</p>
            <p className="text-xs md:text-sm text-gray-700">{hasil?.totalTiket || 0} tiket</p>
            <p className="ml-auto text-sm md:text-lg font-bold text-red-700">{formatRupiah(hasil?.totalFee || 0)}</p>
          </div>
        )}

        {(hasil?.tiketTanpaPenjual || 0) > 0 && (
          <p className="mt-2 text-[10px] md:text-xs text-gray-500">
            Catatan: {hasil?.tiketTanpaPenjual} tiket tidak dicocokkan ke agen (akun penjual tidak ditemukan di daftar agen daerah ini).
          </p>
        )}
      </div>
    </div>
  )
}

export default function LaporanFeeBulananPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-400">Memuat...</p>}>
      <LaporanFeeBulananContent />
    </Suspense>
  )
}
