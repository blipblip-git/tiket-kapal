'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getOperatorSession, type Profile } from '@/lib/supabase'

export default function DashboardLoketMenuPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const sesi = getOperatorSession()
    if (sesi && (sesi.role === 'petugas_loket' || sesi.role === 'petugas_mobile')) {
      setProfile(sesi)
    } else {
      router.push('/login')
    }
    setLoading(false)
  }, [router])

  function handleLogout() {
    localStorage.removeItem('petugas_session')
    localStorage.removeItem('mode_kerja')
    router.push('/login')
  }

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat...</p>
  if (!profile) return null

  let labelRole = 'Operator'
  if (profile.role === 'petugas_loket') labelRole = 'Operator Loket'
  if (profile.role === 'petugas_mobile') labelRole = 'Operator Mobile'
  if (profile.role === 'terminal_keberangkatan') labelRole = 'Operator Keberangkatan'

  const judulHalaman = `${labelRole} ${profile.lokasi} - ${profile.nama}`

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        
        {/* HEADER */}
        <div className="flex justify-between items-center mb-8 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{judulHalaman}</h1>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Silakan pilih menu di bawah ini.
            </p>
          </div>
          <button onClick={handleLogout} className="text-sm bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 font-medium">
            Logout
          </button>
        </div>

        {/* MENU UTAMA */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* MENU JUAL TIKET */}
          <button 
            onClick={() => router.push('/dashboard/loket')} 
            className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg hover:-translate-y-1 transition border border-gray-200 text-left flex flex-col items-start h-48 justify-center"
          >
            <div className="text-5xl mb-4">💵</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Jual Tiket</h2>
            <p className="text-sm text-gray-600">Layani penjualan tiket tunai di loket atau secara mobile.</p>
          </button>

          {/* MENU LAPORAN PENJUALAN (DIREVISI) */}
          <button 
            onClick={() => router.push('/laporan-kasir')} 
            className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg hover:-translate-y-1 transition border border-gray-200 text-left flex flex-col items-start h-48 justify-center"
          >
            <div className="text-5xl mb-4">📊</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Laporan Penjualan</h2>
            <p className="text-sm text-gray-600">Lihat dan cetak rekap penjualan tiket Anda hari ini.</p>
          </button>

          {/* MENU CETAK ULANG TIKET */}
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