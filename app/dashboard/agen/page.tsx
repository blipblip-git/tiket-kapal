'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getOperatorSession, type Profile } from '@/lib/supabase'

export default function DashboardAgenPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const sesi = getOperatorSession()
    
    if (!sesi) {
      router.push('/login')
      return
    }

    if (sesi.role !== 'agen') {
      router.push('/login')
      return
    }

    setProfile(sesi)
    setLoading(false)
  }, [router])

  function handleLogout() {
    localStorage.removeItem('petugas_session')
    localStorage.removeItem('mode_kerja')
    router.push('/login')
  }

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat dashboard...</p>
  if (!profile) return null

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto">
        
        {/* HEADER */}
        <div className="flex justify-between items-center mb-8 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                Dashboard Agen
              </h1>
              <span className="bg-purple-100 text-purple-800 text-sm px-3 py-1 rounded-full font-bold">
                {profile.nama}
              </span>
            </div>
            {/* Teks "Silakan pilih menu di bawah ini" sudah dihapus */}
          </div>
          <button onClick={handleLogout} className="text-sm bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 font-medium">
            Logout
          </button>
        </div>

        {/* MENU UTAMA */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <button 
            onClick={() => router.push('/agen/jual-tiket')} 
            className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg hover:-translate-y-1 transition border border-gray-200 text-left flex flex-col items-start h-48 justify-center"
          >
            <div className="text-5xl mb-4">💵</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Jual Tiket</h2>
            <p className="text-sm text-gray-600">Jual tiket semua kapal (Online, Loket, dll).</p>
          </button>

          <button 
            onClick={() => router.push('/agen/laporan')} 
            className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg hover:-translate-y-1 transition border border-gray-200 text-left flex flex-col items-start h-48 justify-center"
          >
            <div className="text-5xl mb-4">📊</div>
            {/* Teks diubah jadi Laporan Penjualan */}
            <h2 className="text-xl font-bold text-gray-900 mb-2">Laporan Penjualan</h2>
            <p className="text-sm text-gray-600">Lihat rekap penjualan tiket yang Anda jual.</p>
          </button>

          <button 
            onClick={() => router.push('/cetak-ulang')} 
            className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg hover:-translate-y-1 transition border border-gray-200 text-left flex flex-col items-start h-48 justify-center"
          >
            <div className="text-5xl mb-4">🖨️</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Cetak Ulang Tiket</h2>
            <p className="text-sm text-gray-600">Cari dan simpan ulang e-tiket penumpang jika gagal unduh.</p>
          </button>

        </div>

      </div>
    </div>
  )
}