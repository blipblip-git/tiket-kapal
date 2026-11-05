'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getProfile, getOperatorSession, type Profile } from '@/lib/supabase'

export default function LaporanPenjualanAdminPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      let p = await getProfile()
      if (!p) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) p = sesiLokal as unknown as Profile
      }

      if (!p || p.role !== 'admin_utama') {
        router.push('/login')
        return
      }

      setProfile(p)
      setLoading(false)
    }
    init()
  }, [router])

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat...</p>
  if (!profile) return null

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto">
        
        {/* HEADER */}
        <div className="flex justify-between items-center mb-8 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Laporan Penjualan</h1>
            <p className="text-sm text-gray-600 mt-1">Pilih kota atau lihat laporan gabungan seluruh rute.</p>
          </div>
          <button onClick={() => router.push('/dashboard')} className="text-sm text-blue-600 hover:underline">
            &larr; Kembali ke Dashboard
          </button>
        </div>

        {/* 3 KARTU */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* KARTU TARAKAN */}
          <button 
            onClick={() => router.push('/laporan?view=penjualan&lokasi=Tarakan')}
            className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg hover:-translate-y-1 transition border border-gray-200 text-left flex flex-col items-start h-48 justify-center"
          >
            <div className="text-5xl mb-4">⛴️</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Laporan Tarakan</h2>
            <p className="text-sm text-gray-600">Lihat rekap penjualan tiket dari Tarakan (Online, Agen, Operator).</p>
          </button>

          {/* KARTU TANJUNG SELOR */}
          <button 
            onClick={() => router.push('/laporan?view=penjualan&lokasi=Tanjung Selor')}
            className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg hover:-translate-y-1 transition border border-gray-200 text-left flex flex-col items-start h-48 justify-center"
          >
            <div className="text-5xl mb-4">⛴️</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Laporan Tanjung Selor</h2>
            <p className="text-sm text-gray-600">Lihat rekap penjualan tiket dari Tanjung Selor (Online, Agen, Operator).</p>
          </button>

          {/* KARTU LAPORAN GABUNGAN */}
          <button 
            onClick={() => router.push('/laporan-gabungan')}
            className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg hover:-translate-y-1 transition border-2 border-blue-400 bg-blue-50 text-left flex flex-col items-start h-48 justify-center"
          >
            <div className="text-5xl mb-4">📊</div>
            <h2 className="text-xl font-bold text-blue-900 mb-2">Laporan Gabungan</h2>
            <p className="text-sm text-blue-700">Lihat rekap harian gabungan pendapatan Tarakan & Tanjung Selor secara berdampingan.</p>
          </button>

        </div>

      </div>
    </div>
  )
}