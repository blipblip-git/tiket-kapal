'use client'

// app/dashboard-superadmin/penerimaan-fee/page.tsx
// KHUSUS SUPERADMIN: atur Fee Platform (nilai global) + masuk ke laporan fee
// harian / bulanan dari semua penjualan offline (agen & petugas).
import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ambilFeePlatform, simpanFeePlatform, tabelPlatformAda } from '@/lib/fee'
import { muatLaporanFeePlatform } from '@/lib/laporanFee'
import { bulanSekarang, formatRupiah, labelBulan } from '@/lib/periode'

export default function PenerimaanFeePage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-400 bg-gray-900 min-h-screen">Memuat...</p>}>
      <PenerimaanFeeContent />
    </Suspense>
  )
}

function PenerimaanFeeContent() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pesan, setPesan] = useState('')
  const [proses, setProses] = useState(false)

  const [feeTersimpan, setFeeTersimpan] = useState(0)
  const [feeInput, setFeeInput] = useState('0')
  const [adaTabel, setAdaTabel] = useState(true)
  const [ringkas, setRingkas] = useState({ tiket: 0, fee: 0 })

  const bulanAktif = bulanSekarang()

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/superadmin'); return }

      const { data: p, error: errP } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', user.id)
        .single()

      if (errP || !p || (p.role || '').trim().toLowerCase() !== 'superadmin') {
        setError('Akses ditolak. Halaman ini khusus Superadmin.')
        setLoading(false)
        return
      }

      const ada = await tabelPlatformAda()
      setAdaTabel(ada)

      const nilai = await ambilFeePlatform()
      setFeeTersimpan(nilai)
      setFeeInput(String(nilai))

      const bulanan = await muatLaporanFeePlatform({ mode: 'bulanan', bulan: bulanAktif })
      setRingkas({ tiket: bulanan.totalTiket, fee: bulanan.totalFee })

      setLoading(false)
    }
    loadData()
  }, [router, bulanAktif])

  const simpan = async () => {
    setProses(true)
    setPesan('')
    const nilai = Math.max(0, Math.round(Number(feeInput) || 0))
    const hasil = await simpanFeePlatform(nilai, 'Superadmin')
    if (hasil) {
      setPesan(hasil)
    } else {
      setFeeTersimpan(nilai)
      setPesan('Fee platform tersimpan: ' + formatRupiah(nilai) + ' per tiket offline.')
      const bulanan = await muatLaporanFeePlatform({ mode: 'bulanan', bulan: bulanAktif })
      setRingkas({ tiket: bulanan.totalTiket, fee: bulanan.totalFee })
    }
    setProses(false)
  }

  if (loading) return <p className="p-6 text-center text-gray-400 bg-gray-900 min-h-screen">Memuat...</p>
  if (error) return <p className="p-6 text-center text-red-500 bg-gray-900 min-h-screen">{error}</p>

  return (
    <div className="min-h-screen bg-gray-900 p-6 text-white">
      <div className="max-w-4xl mx-auto">

        <div className="flex justify-between items-center mb-6 bg-red-950 border border-red-800 p-5 rounded-xl">
          <div>
            <h1 className="text-2xl font-bold">Penerimaan Fee</h1>
            <p className="text-sm text-red-200">Fee platform dari semua penjualan offline (agen, loket, mobile, keberangkatan)</p>
          </div>
          <button onClick={() => router.push('/dashboard-superadmin')} className="text-sm bg-gray-800 text-white px-3 py-2 rounded hover:bg-gray-700 border border-gray-700 font-bold">
            &larr; Kembali
          </button>
        </div>

        {/* PENGATURAN FEE PLATFORM */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-3xl">💵</div>
            <div className="flex-1 min-w-[220px]">
              <p className="text-sm font-bold text-white">Fee Platform per Tiket</p>
              <p className="text-xs text-gray-400">
                Berlaku sekarang: <span className="font-bold text-red-300">{formatRupiah(feeTersimpan)}</span> / tiket dewasa offline.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={500}
                value={feeInput}
                onChange={(e) => setFeeInput(e.target.value)}
                className="w-32 border border-gray-600 bg-gray-900 text-white rounded px-3 py-2 text-sm"
              />
              <button
                onClick={simpan}
                disabled={proses || !adaTabel}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-bold"
              >
                {proses ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
          {pesan && <p className="mt-3 text-xs text-green-300">{pesan}</p>}
          {!adaTabel && (
            <p className="mt-3 text-xs text-red-300">
              Tabel <span className="font-mono">pengaturan_platform</span> belum ada. Jalankan SQL migrasi fee dulu.
            </p>
          )}
          <p className="mt-3 text-[11px] text-gray-400">
            Catatan: nilai fee dibekukan di setiap transaksi. Transaksi lama yang belum punya catatan fee dihitung memakai nilai yang berlaku sekarang.
          </p>
        </div>

        {/* RINGKASAN BULAN INI */}
        <div className="bg-gray-800 border border-red-800 rounded-xl p-5 mb-6 flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="text-sm font-bold text-white">Fee {labelBulan(bulanAktif)}</p>
          <p className="text-sm text-gray-300">{ringkas.tiket} tiket offline</p>
          <p className="ml-auto text-xl font-bold text-red-300">{formatRupiah(ringkas.fee)}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            onClick={() => router.push('/dashboard-superadmin/penerimaan-fee/harian')}
            className="bg-red-950 p-8 rounded-xl border border-red-800 hover:bg-red-900 transition text-left flex flex-col items-start h-44 justify-center"
          >
            <div className="text-4xl mb-3">📅</div>
            <h2 className="text-lg font-bold text-white mb-1">Laporan Fee Harian</h2>
            <p className="text-xs text-red-200">Fee platform per jam &amp; kapal untuk 1 tanggal.</p>
          </button>

          <button
            onClick={() => router.push('/dashboard-superadmin/penerimaan-fee/bulanan')}
            className="bg-red-950 p-8 rounded-xl border border-red-800 hover:bg-red-900 transition text-left flex flex-col items-start h-44 justify-center"
          >
            <div className="text-4xl mb-3">🗓️</div>
            <h2 className="text-lg font-bold text-white mb-1">Laporan Fee Bulanan</h2>
            <p className="text-xs text-red-200">Fee platform per tanggal &amp; kapal dalam 1 bulan.</p>
          </button>
        </div>
      </div>
    </div>
  )
}
