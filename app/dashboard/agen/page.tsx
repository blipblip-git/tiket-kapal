'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getOperatorSession, getProfile, type Profile } from '@/lib/supabase'

export default function DashboardAgenPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cekSesi() {
      const sesiPetugas = getOperatorSession()
      
      if (sesiPetugas) {
        if (sesiPetugas.role !== 'agen' && sesiPetugas.role !== 'admin_utama') {
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

  if (loading) return <p className="p-6 text-center text-gray-600 mt-10">Memuat dashboard...</p>
  if (!profile) return null

  return (
    <div className="h-[100dvh] bg-gray-50 flex flex-col overflow-hidden">
      <div className="max-w-md w-full mx-auto p-4 flex-1 flex flex-col">
        
        {/* HEADER (Dikasih Shadow) */}
        <div className="bg-white p-4 rounded-xl shadow-md border border-gray-100 mb-4 flex-shrink-0">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-lg md:text-xl font-bold text-gray-900 leading-tight">
                Dashboard Agen
              </h1>
              <p className="text-sm text-gray-600 mt-1 font-medium">
                {profile.lokasi || ''} - {profile.nama}
              </p>
            </div>
            <button 
              onClick={handleLogout} 
              className="text-xs bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 font-bold shadow-sm"
            >
              Logout
            </button>
          </div>
        </div>

        {/* MENU UTAMA (Disusun Vertikal agar rapi 1 layar) */}
        <div className="flex-1 flex flex-col gap-3 justify-center pb-4">
          
          <button 
            onClick={() => router.push('/agen/jual-tiket')} 
            className="bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition border border-gray-200 text-left flex items-center gap-4"
          >
            <div className="text-3xl bg-green-50 w-14 h-14 flex items-center justify-center rounded-lg">💵</div>
            <h2 className="text-base font-bold text-gray-900 flex-1">Jual Tiket</h2>
            <span className="text-gray-400 text-xl font-light">&rsaquo;</span>
          </button>

          <button 
            onClick={() => router.push('/agen/laporan')} 
            className="bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition border border-gray-200 text-left flex items-center gap-4"
          >
            <div className="text-3xl bg-purple-50 w-14 h-14 flex items-center justify-center rounded-lg">📊</div>
            <h2 className="text-base font-bold text-gray-900 flex-1">Laporan Penjualan</h2>
            <span className="text-gray-400 text-xl font-light">&rsaquo;</span>
          </button>

          <button 
            onClick={() => router.push('/cetak-ulang')} 
            className="bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition border border-gray-200 text-left flex items-center gap-4"
          >
            <div className="text-3xl bg-orange-50 w-14 h-14 flex items-center justify-center rounded-lg">🖨️</div>
            <h2 className="text-base font-bold text-gray-900 flex-1">Cetak Ulang Tiket</h2>
            <span className="text-gray-400 text-xl font-light">&rsaquo;</span>
          </button>

        </div>

      </div>
    </div>
  )
}