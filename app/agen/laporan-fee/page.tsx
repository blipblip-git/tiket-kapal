'use client'

// app/agen/laporan-fee/page.tsx
// Menu Laporan Fee untuk agen: Harian & Bulanan (khusus akun yang login).
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getOperatorSession, supabase, type Profile } from '@/lib/supabase'
import { kodeDaerah } from '@/lib/fee'

export default function MenuLaporanFeeAgenPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [fee, setFee] = useState(0)

  useEffect(() => {
    const sesi = getOperatorSession()
    if (!sesi) { router.push('/login'); return }
    setProfile(sesi)

    // Sesi login tidak menyimpan fee, jadi baca profil terbaru dari DB.
    supabase.from('profiles').select('*').eq('id', sesi.id).maybeSingle().then(({ data }) => {
      if (data) setFee(Number((data as any).fee || 0))
    })
  }, [router])

  if (!profile) return <p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>

  const lokasi = String(profile.lokasi || '-')
  const kode = kodeDaerah(String(profile.lokasi || ''))

  return (
    <div className="min-h-[100dvh] bg-gray-50 p-4 md:p-6">
      <div className="max-w-3xl w-full mx-auto">

        <div className="flex justify-between items-start gap-2 mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Laporan Fee</h1>
            <p className="text-xs md:text-sm text-gray-500">Fee penjualan Anda per tiket &bull; {lokasi} / {kode}</p>
          </div>
          <button
            onClick={() => router.push('/dashboard/agen')}
            className="bg-white border border-gray-200 text-gray-700 px-3 py-2 rounded text-xs md:text-sm font-bold hover:bg-gray-100 transition"
          >
            &larr; Kembali
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => router.push('/laporan-fee-harian?saya=1')}
            className="bg-white border border-gray-200 p-6 rounded-xl hover:shadow-md transition text-left flex flex-col items-start h-40 justify-center shadow-sm"
          >
            <div className="text-4xl mb-3">📅</div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Fee Harian</h2>
            <p className="text-xs md:text-sm text-gray-500">Rekap fee per jam &amp; kapal untuk satu tanggal.</p>
          </button>

          <button
            onClick={() => router.push('/laporan-fee-bulanan?saya=1')}
            className="bg-white border border-gray-200 p-6 rounded-xl hover:shadow-md transition text-left flex flex-col items-start h-40 justify-center shadow-sm"
          >
            <div className="text-4xl mb-3">🗓️</div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Fee Bulanan</h2>
            <p className="text-xs md:text-sm text-gray-500">Rekap fee per tanggal &amp; kapal dalam satu bulan.</p>
          </button>
        </div>

        <p className="mt-4 text-[11px] md:text-xs text-gray-500">
          Fee Anda saat ini: <span className="font-bold text-gray-900">Rp {fee.toLocaleString('id-ID')}</span> per tiket.
          Hubungi Admin Utama kalau nilainya perlu diubah.
        </p>
      </div>
    </div>
  )
}
