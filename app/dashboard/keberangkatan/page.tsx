'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getOperatorSession, getProfile, type Profile } from '@/lib/supabase'

export default function DashboardKeberangkatanPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cekSesi() {
      const sesiPetugas = getOperatorSession()
      
      if (sesiPetugas) {
        if (sesiPetugas.role !== 'terminal_keberangkatan' && sesiPetugas.role !== 'admin_utama') {
          router.push('/login')
          return
        }
        setProfile(sesiPetugas)
        setLoading(false)
        return
      }

      // Cek apakah admin login via Supabase Auth
      const adminProfile = await getProfile()
      if (adminProfile && adminProfile.role === 'admin_utama') {
        setProfile(adminProfile)
        setLoading(false)
        return
      }

      // Jika tidak ada sesi sama sekali, tendang ke login
      router.push('/login')
    }
    cekSesi()
  }, [router])

  function handleLogout() {
    // 1. Tembak database untuk buka gembok (TANPA await, biarkan berjalan di background)
    if (profile) {
      supabase.from('profiles').update({ sesi_aktif: false }).eq('id', profile.id).then();
    }
    
    // 2. Langsung hapus sesi di browser dan pindah halaman (INSTAN)
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
                Operator Keberangkatan {profile.lokasi || ''}
              </h1>
              <span className="bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full font-bold">
                {profile.nama}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">Silakan pilih menu di bawah ini.</p>
          </div>
          <button onClick={handleLogout} className="text-sm bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 font-medium">
            Logout
          </button>
        </div>

        {/* MENU UTAMA - 4 KARTU */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          <button 
            onClick={() => router.push('/scan')} 
            className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg hover:-translate-y-1 transition border border-gray-200 text-left flex flex-col items-start h-48 justify-center"
          >
            <div className="text-5xl mb-4">📷</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Scan Boarding</h2>
            <p className="text-sm text-gray-600">Scan QR Code e-tiket penumpang untuk mencatat status boarding.</p>
          </button>

          <button 
            onClick={() => router.push('/cari-tiket')} 
            className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg hover:-translate-y-1 transition border border-gray-200 text-left flex flex-col items-start h-48 justify-center"
          >
            <div className="text-5xl mb-4">💵</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Jual / Cari Tiket</h2>
            <p className="text-sm text-gray-600">Layani pembelian tiket mendadak atau konfirmasi pesanan online.</p>
          </button>

          <button 
            onClick={() => router.push('/pusat-laporan-keberangkatan')} 
            className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg hover:-translate-y-1 transition border border-gray-200 text-left flex flex-col items-start h-48 justify-center"
          >
            <div className="text-5xl mb-4">📊</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Pusat Laporan</h2>
            <p className="text-sm text-gray-600">Akses Laporan Manifest (Syahbandar), Laporan Scan Boarding, dan Laporan Kasir.</p>
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