'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getOperatorSession, getProfile, ambilNamaPerusahaan, hapusSesiAuthLokal, type Profile } from '@/lib/supabase'
import DashboardHeader from '@/components/DashboardHeader'

export default function DashboardKeberangkatanPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [namaPerusahaan, setNamaPerusahaan] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  // Teks bisa direvisi Superadmin lewat Pusat Kontrol Website > Petugas.
  const [teks, setTeks] = useState({
    judul_dashboard: 'Dasbor Petugas Keberangkatan',
    menu_scan: 'Scan Boarding',
    menu_jual: 'Jual Tiket',
    menu_laporan: 'Pusat Laporan',
    menu_cetak: 'Cetak Ulang Tiket',
  })

  useEffect(() => {
    async function muatData() {
      setRefreshing(reloadKey > 0)

      const { data: textData } = await supabase
        .from('pengaturan_teks')
        .select('data_teks')
        .eq('role', 'petugas')
        .maybeSingle()

      if (textData?.data_teks) {
        setTeks((lama) => ({ ...lama, ...(textData.data_teks as Record<string, string>) }))
      }

      const sesiPetugas = getOperatorSession()
      let p: Profile | null = null

      if (sesiPetugas) {
        if (sesiPetugas.role !== 'terminal_keberangkatan' && sesiPetugas.role !== 'admin_utama') {
          setRefreshing(false)
          router.push('/login')
          return
        }
        p = sesiPetugas
      } else {
        // Cek apakah admin login via Supabase Auth
        const adminProfile = await getProfile()
        if (adminProfile && adminProfile.role === 'admin_utama') p = adminProfile
      }

      // Jika tidak ada sesi sama sekali, tendang ke login
      if (!p) {
        setRefreshing(false)
        router.push('/login')
        return
      }

      setProfile(p)
      setNamaPerusahaan(await ambilNamaPerusahaan(p))
      setRefreshing(false)
      setLoading(false)
    }
    muatData()
  }, [router, reloadKey])

  function handleLogout() {
    // 1. Tembak database untuk buka gembok (TANPA await, biarkan berjalan di background)
    if (profile) {
      supabase.from('profiles').update({ sesi_aktif: false }).eq('id', profile.id).then();
    }

    // 2. Langsung hapus sesi di browser dan pindah halaman (INSTAN)
    hapusSesiAuthLokal()
    localStorage.removeItem('petugas_session')
    localStorage.removeItem('mode_kerja')
    router.push('/login')
  }

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat dashboard...</p>
  if (!profile) return null

  return (
    <div className="h-[100dvh] bg-gray-50 flex flex-col overflow-hidden">
      <div className="max-w-md w-full mx-auto p-4 flex-1 flex flex-col">

        {/* HEADER (Format Seragam: Nama Perusahaan / Judul / Lokasi - Nama) */}
        <DashboardHeader
          namaPerusahaan={namaPerusahaan || profile.nama}
          judul={teks.judul_dashboard}
          subJudul={`${profile.lokasi || ''} - ${profile.nama}`}
          onRefresh={() => setReloadKey((k) => k + 1)}
          refreshing={refreshing}
          aksi={
            <button
              onClick={handleLogout}
              className="text-xs bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 font-bold shadow-sm"
            >
              Logout
            </button>
          }
        />

        {/* MENU UTAMA (Disusun Vertikal agar rapi 1 layar) */}
        <div className="flex-1 flex flex-col gap-3 justify-center pb-4">

          <button
            onClick={() => router.push('/scan')}
            className="bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition border border-gray-200 text-left flex items-center gap-4"
          >
            <div className="text-3xl bg-blue-50 w-14 h-14 flex items-center justify-center rounded-lg">📷</div>
            <h2 className="text-base font-bold text-gray-900 flex-1">{teks.menu_scan}</h2>
            <span className="text-gray-400 text-xl font-light">&rsaquo;</span>
          </button>

          <button
            onClick={() => router.push('/cari-tiket')}
            className="bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition border border-gray-200 text-left flex items-center gap-4"
          >
            <div className="text-3xl bg-green-50 w-14 h-14 flex items-center justify-center rounded-lg">💵</div>
            <h2 className="text-base font-bold text-gray-900 flex-1">{teks.menu_jual}</h2>
            <span className="text-gray-400 text-xl font-light">&rsaquo;</span>
          </button>

          <button
            onClick={() => router.push('/pusat-laporan-keberangkatan')}
            className="bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition border border-gray-200 text-left flex items-center gap-4"
          >
            <div className="text-3xl bg-purple-50 w-14 h-14 flex items-center justify-center rounded-lg">📊</div>
            <h2 className="text-base font-bold text-gray-900 flex-1">{teks.menu_laporan}</h2>
            <span className="text-gray-400 text-xl font-light">&rsaquo;</span>
          </button>

          <button
            onClick={() => router.push('/cetak-ulang')}
            className="bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition border border-gray-200 text-left flex items-center gap-4"
          >
            <div className="text-3xl bg-orange-50 w-14 h-14 flex items-center justify-center rounded-lg">🖨️</div>
            <h2 className="text-base font-bold text-gray-900 flex-1">{teks.menu_cetak}</h2>
            <span className="text-gray-400 text-xl font-light">&rsaquo;</span>
          </button>

        </div>

      </div>
    </div>
  )
}
