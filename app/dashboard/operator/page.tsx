'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { getProfile, getOperatorSession } from '@/lib/supabase'

function OperatorContent() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadData() {
      // 1. Coba ambil dari Supabase Auth dulu
      let profile = await getProfile()

      // 2. Jika gagal, coba ambil dari localStorage
      if (!profile) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) {
          profile = sesiLokal as any
        }
      }

      // 3. Jika dua-duanya kosong, baru tendang ke login
      if (!profile) {
        router.push('/login')
        return
      }

      // 4. Pastikan hanya Admin Utama yang bisa akses halaman ini
      if (profile.role !== 'admin_utama') {
        setError('Anda tidak punya akses ke halaman ini')
        setLoading(false)
        return
      }

      setLoading(false)
    }
    loadData()
  }, [router])

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat...</p>
  if (error) return <p className="p-6 text-center text-red-600">Error: {error}</p>

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        
        <div className="flex justify-between items-center mb-8 bg-white p-4 rounded shadow-sm border border-gray-200">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pusat Laporan Operator</h1>
            <p className="text-sm text-gray-700">Pilih kota untuk melihat seluruh aktivitas operator.</p>
          </div>
          <button 
            onClick={() => router.push('/dashboard')}
            className="text-sm bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300 font-medium"
          >
            &larr; Kembali ke Dashboard
          </button>
        </div>

        {/* 2 KARTU BESAR */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* KARTU TARAKAN */}
          <button 
            onClick={() => router.push('/laporan?lokasi=Tarakan')}
            className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg hover:-translate-y-1 transition border border-gray-200 text-left flex flex-col items-start h-48 justify-center"
          >
            <div className="text-5xl mb-4">⛴️</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Operator Tarakan</h2>
            <p className="text-sm text-gray-600">Lihat rekap penjualan tiket (Online, Loket, Mobile, Keberangkatan) dan hasil scan boarding.</p>
          </button>

          {/* KARTU TANJUNG SELOR */}
          <button 
            onClick={() => router.push('/laporan?lokasi=Tanjung Selor')}
            className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg hover:-translate-y-1 transition border border-gray-200 text-left flex flex-col items-start h-48 justify-center"
          >
            <div className="text-5xl mb-4">⛴️</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Operator Tanjung Selor</h2>
            <p className="text-sm text-gray-600">Lihat rekap penjualan tiket (Online, Loket, Mobile, Keberangkatan) dan hasil scan boarding.</p>
          </button>

        </div>

      </div>
    </div>
  )
}

export default function DashboardOperatorPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600">Memuat...</p>}>
      <OperatorContent />
    </Suspense>
  )
}