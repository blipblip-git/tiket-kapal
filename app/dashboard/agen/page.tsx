'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getOperatorSession, getProfile, ambilNamaPerusahaan, type Profile } from '@/lib/supabase'
import DashboardHeader from '@/components/DashboardHeader'

export default function DashboardAgenPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [namaPerusahaan, setNamaPerusahaan] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  // Teks bisa direvisi Superadmin lewat Pusat Kontrol Website > Agen.
  const [teks, setTeks] = useState({
    judul_dashboard: 'Dasbor Agen',
    menu_jual: 'Jual Tiket',
    menu_laporan: 'Laporan Penjualan',
    menu_cetak: 'Cetak Ulang Tiket',
    ikon_jual: '💵',
    ikon_laporan: '📊',
    ikon_cetak: '🖨️',
  })

  useEffect(() => {
    async function muatData() {
      setRefreshing(reloadKey > 0)

      const { data: textData } = await supabase
        .from('pengaturan_teks')
        .select('data_teks')
        .eq('role', 'agen')
        .maybeSingle()

      if (textData?.data_teks) {
        setTeks((lama) => ({ ...lama, ...(textData.data_teks as Record<string, string>) }))
      }

      const sesiPetugas = getOperatorSession()
      let p: Profile | null = null

      if (sesiPetugas) {
        if (sesiPetugas.role !== 'agen' && sesiPetugas.role !== 'admin_utama') {
          setRefreshing(false)
          router.push('/login')
          return
        }
        p = sesiPetugas
      } else {
        const adminProfile = await getProfile()
        if (adminProfile && adminProfile.role === 'admin_utama') p = adminProfile
      }

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
    if (profile) {
      supabase.from('profiles').update({ sesi_aktif: false }).eq('id', profile.id).then();
    }

    localStorage.removeItem('petugas_session')
    localStorage.removeItem('mode_kerja')
    router.push('/login')
  }

  if (loading) return <p className="p-6 text-center text-gray-600 mt-10">Memuat dashboard...</p>
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

        {/* MENU UTAMA (GAP DIHILANGKAN) */}
        <div className="flex-1 flex flex-col gap-3 justify-start pb-4">

          <button
            onClick={() => router.push('/agen/jual-tiket')}
            className="bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition border border-gray-200 text-left flex items-center gap-4"
          >
            <div className="text-3xl bg-green-50 w-14 h-14 flex items-center justify-center rounded-lg">{teks.ikon_jual}</div>
            <h2 className="text-base font-bold text-gray-900 flex-1">{teks.menu_jual}</h2>
            <span className="text-gray-400 text-xl font-light">&rsaquo;</span>
          </button>

          <button
            onClick={() => router.push('/agen/laporan')}
            className="bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition border border-gray-200 text-left flex items-center gap-4"
          >
            <div className="text-3xl bg-purple-50 w-14 h-14 flex items-center justify-center rounded-lg">{teks.ikon_laporan}</div>
            <h2 className="text-base font-bold text-gray-900 flex-1">{teks.menu_laporan}</h2>
            <span className="text-gray-400 text-xl font-light">&rsaquo;</span>
          </button>

          <button
            onClick={() => router.push('/agen/laporan-fee')}
            className="bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition border border-gray-200 text-left flex items-center gap-4"
          >
            <div className="text-3xl bg-red-50 w-14 h-14 flex items-center justify-center rounded-lg">💰</div>
            <h2 className="text-base font-bold text-gray-900 flex-1">Laporan Fee</h2>
            <span className="text-gray-400 text-xl font-light">&rsaquo;</span>
          </button>

          <button
            onClick={() => router.push('/cetak-ulang')}
            className="bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition border border-gray-200 text-left flex items-center gap-4"
          >
            <div className="text-3xl bg-orange-50 w-14 h-14 flex items-center justify-center rounded-lg">{teks.ikon_cetak}</div>
            <h2 className="text-base font-bold text-gray-900 flex-1">{teks.menu_cetak}</h2>
            <span className="text-gray-400 text-xl font-light">&rsaquo;</span>
          </button>

        </div>

      </div>
    </div>
  )
}
