'use client'

// app/laporan-fee-platform/page.tsx
// Laporan Fee PLATFORM untuk Admin Utama (penyewa sendiri) / Superadmin (semua).
// Dibuka dari 2 kartu di /laporan-penjualan-admin?menu=fee:platform:
//   ?kanal=offline  -> penjualan lewat agen/loket/mobile/keberangkatan/petugas
//   ?kanal=online   -> penjualan web (kanal 'online')
// Mode Harian / Bulanan bisa diganti di dalam halaman ini.
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getOperatorSession, getProfile, type Profile } from '@/lib/supabase'
import { idOperator } from '@/lib/tenant'
import { muatLaporanFeePlatform, type HasilLaporanPlatform } from '@/lib/laporanFee'
import { bulanSekarang, formatRupiah, formatTanggalPendek, labelBulan } from '@/lib/periode'

function tanggalHariIni(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function LaporanFeePlatformContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const kanal: 'offline' | 'online' = searchParams.get('kanal') === 'online' ? 'online' : 'offline'
  const mode: 'harian' | 'bulanan' = searchParams.get('mode') === 'bulanan' ? 'bulanan' : 'harian'
  const tanggalAktif = searchParams.get('tanggal') || tanggalHariIni()
  const bulanAktif = searchParams.get('bulan') || bulanSekarang()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasil, setHasil] = useState<HasilLaporanPlatform | null>(null)

  useEffect(() => {
    async function init() {
      let p = getOperatorSession()
      if (!p) p = await getProfile()
      if (!p) { router.push('/login'); return }
      const role = String(p.role || '').toLowerCase()
      if (role !== 'admin_utama' && role !== 'superadmin') {
        setError('Anda tidak punya akses ke Laporan Fee Platform.')
        setLoading(false)
        return
      }
      setProfile(p)
    }
    init()
  }, [router])

  useEffect(() => {
    async function fetchData() {
      if (!profile) return
      setLoading(true)
      setError('')
      const data = await muatLaporanFeePlatform({
        mode,
        tanggal: tanggalAktif,
        bulan: bulanAktif,
        kanal,
        // Superadmin melihat semua penyewa, Admin Utama hanya penyewanya sendiri.
        operatorId: idOperator(profile)
      })
      if (data.error) {
        setError(data.error)
        setHasil(null)
      } else {
        setHasil(data)
      }
      setLoading(false)
    }
    fetchData()
  }, [profile, mode, tanggalAktif, bulanAktif, kanal])

  const urlDengan = (ubah: { mode?: 'harian' | 'bulanan'; kanal?: 'offline' | 'online'; tanggal?: string; bulan?: string }) => {
    const modeBaru = ubah.mode || mode
    const kanalBaru = ubah.kanal || kanal
    const q = new URLSearchParams({ kanal: kanalBaru, mode: modeBaru })
    if (modeBaru === 'harian') q.set('tanggal', ubah.tanggal || tanggalAktif)
    else q.set('bulan', ubah.bulan || bulanAktif)
    return `/laporan-fee-platform?${q.toString()}`
  }

  if (error) return <p className="p-6 text-center text-red-600 mt-10">{error}</p>
  if (loading && !hasil) return <p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>
  if (!profile) return null

  const judulKanal = kanal === 'online' ? 'Online' : 'Offline'
  const periodeLabel = mode === 'harian' ? formatTanggalPendek(tanggalAktif) : labelBulan(bulanAktif)

  return (
    <div className="min-h-screen bg-gray-50 p-3 md:p-6 print:bg-white print:p-0">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: white !important; }
          .print-hidden { display: none !important; }
          tr { page-break-inside: avoid; }
        }
      `}} />

      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex flex-wrap justify-between items-start gap-2 bg-white border border-gray-200 rounded-xl p-4 shadow-sm print-hidden">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Laporan Fee Platform {judulKanal}</h1>
            <p className="text-sm text-gray-600">
              {periodeLabel} &bull; {kanal === 'online' ? 'penjualan online (web)' : 'penjualan offline (agen/loket/petugas)'}
              {profile.role === 'superadmin' ? ' • semua penyewa' : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setTimeout(() => window.print(), 100)} className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-sm font-bold">🖨️ Cetak</button>
            <button onClick={() => router.push('/laporan-penjualan-admin?menu=fee:platform')} className="bg-white hover:bg-gray-100 text-gray-700 px-3 py-2 rounded text-sm border border-gray-300">&larr; Kembali</button>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm flex flex-wrap items-end gap-3 print-hidden">
          <div className="flex rounded-md overflow-hidden border border-gray-300">
            <button
              onClick={() => router.replace(urlDengan({ kanal: 'offline' }))}
              className={`px-3 py-2 text-xs font-bold ${kanal === 'offline' ? 'bg-red-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
            >
              Offline
            </button>
            <button
              onClick={() => router.replace(urlDengan({ kanal: 'online' }))}
              className={`px-3 py-2 text-xs font-bold ${kanal === 'online' ? 'bg-red-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
            >
              Online
            </button>
          </div>

          <div className="flex rounded-md overflow-hidden border border-gray-300">
            <button
              onClick={() => router.replace(urlDengan({ mode: 'harian' }))}
              className={`px-3 py-2 text-xs font-bold ${mode === 'harian' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
            >
              Harian
            </button>
            <button
              onClick={() => router.replace(urlDengan({ mode: 'bulanan' }))}
              className={`px-3 py-2 text-xs font-bold ${mode === 'bulanan' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
            >
              Bulanan
            </button>
          </div>

          {mode === 'harian' ? (
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1">Tanggal</label>
              <input
                type="date"
                value={tanggalAktif}
                onChange={(e) => router.replace(urlDengan({ tanggal: e.target.value }))}
                className="border rounded-md px-3 py-2 text-sm text-gray-900 shadow-sm"
              />
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1">Bulan</label>
              <input
                type="month"
                value={bulanAktif}
                onChange={(e) => router.replace(urlDengan({ bulan: e.target.value }))}
                className="border rounded-md px-3 py-2 text-sm text-gray-900 shadow-sm"
              />
            </div>
          )}

          <p className="ml-auto text-[11px] text-gray-500">
            Fee platform berlaku {formatRupiah(hasil?.feeBerlaku || 0)} / tiket dewasa
          </p>
        </div>


        {(hasil?.blok.length || 0) === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center shadow-sm">
            <p className="text-sm text-gray-600">
              Belum ada penjualan {judulKanal.toLowerCase()} pada periode ini.
            </p>
          </div>
        ) : (
          hasil?.blok.map((blok) => (
            <div key={blok.operatorId} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="bg-red-50 border-b border-red-100 px-3 py-2 flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-red-800">{blok.namaPenyewa}</p>
                <p className="text-xs text-red-700">{blok.tiket} tiket</p>
                <p className="ml-auto text-sm font-bold text-red-800">{formatRupiah(blok.total)}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs md:text-sm">
                  <thead className="bg-gray-100 text-gray-700">
                    <tr>
                      <th className="px-2 py-1.5 text-center w-10">NO</th>
                      <th className="px-2 py-1.5 text-left">{mode === 'harian' ? 'JAM' : 'TANGGAL'}</th>
                      <th className="px-2 py-1.5 text-left">KAPAL</th>
                      <th className="px-2 py-1.5 text-right">TIKET</th>
                      <th className="px-2 py-1.5 text-right">FEE</th>
                      <th className="px-2 py-1.5 text-right">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blok.baris.map((baris, idx) => (
                      <tr key={baris.kunci} className="border-t border-gray-100">
                        <td className="px-2 py-1.5 text-center text-gray-500">{idx + 1}</td>
                        <td className="px-2 py-1.5 font-medium text-gray-900">
                          {mode === 'harian' ? baris.jam : formatTanggalPendek(baris.tanggal)}
                        </td>
                        <td className="px-2 py-1.5 text-gray-900">{baris.kapal}</td>
                        <td className="px-2 py-1.5 text-right text-gray-900">{baris.tiket}</td>
                        <td className="px-2 py-1.5 text-right text-gray-700">{formatRupiah(baris.fee)}</td>
                        <td className="px-2 py-1.5 text-right font-bold text-gray-900">{formatRupiah(baris.total)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-red-100 bg-red-50/50">
                      <td colSpan={3} className="px-2 py-1.5 text-right font-bold text-gray-900">Subtotal</td>
                      <td className="px-2 py-1.5 text-right font-bold text-gray-900">{blok.tiket}</td>
                      <td className="px-2 py-1.5"></td>
                      <td className="px-2 py-1.5 text-right font-bold text-red-700">{formatRupiah(blok.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}

        {(hasil?.blok.length || 0) > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 flex flex-wrap items-center gap-2">
            <p className="text-xs md:text-sm font-bold text-gray-900">TOTAL FEE PLATFORM {judulKanal.toUpperCase()}</p>
            <p className="text-xs md:text-sm text-gray-700">{hasil?.totalTiket || 0} tiket</p>
            <p className="ml-auto text-sm md:text-lg font-bold text-red-700">{formatRupiah(hasil?.totalFee || 0)}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function LaporanFeePlatformPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>}>
      <LaporanFeePlatformContent />
    </Suspense>
  )
}

