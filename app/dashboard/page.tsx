'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'

type Statistik = {
  total_pesanan_hari_ini: number
  total_pendapatan_hari_ini: number
}

export default function DashboardAdminPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [stat, setStat] = useState<Statistik>({
    total_pesanan_hari_ini: 0,
    total_pendapatan_hari_ini: 0,
  })
  const [tanggalHariIni, setTanggalHariIni] = useState('')

  useEffect(() => {
    // Set tanggal di dalam useEffect biar aman dari error Next.js 16
    const today = new Date()
    setTanggalHariIni(today.toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }))

    async function loadData() {
      let p = await getProfile()

      if (!p) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) {
          p = sesiLokal as unknown as Profile
        }
      }

      if (!p) {
        router.push('/login')
        return
      }

      if (p.role !== 'admin_utama') {
        setError('Anda tidak punya akses ke halaman ini')
        setLoading(false)
        return
      }

      setProfile(p)

      const hariIni = new Date().toISOString().split('T')[0]
      
      const { data: pesananHariIni } = await supabase
        .from('pesanan')
        .select('id, jadwal:jadwal_id ( tanggal, harga )')
        .eq('status', 'paid')
      
      let pesananCount = 0
      let pendapatan = 0

      if (pesananHariIni) {
        for (const p of pesananHariIni) {
          const jadwalData = p.jadwal as any
          if (jadwalData && jadwalData.tanggal === hariIni) {
            pesananCount++
            pendapatan += jadwalData.harga || 0
          }
        }
      }

      setStat({
        total_pesanan_hari_ini: pesananCount,
        total_pendapatan_hari_ini: pendapatan,
      })

      setLoading(false)
    }

    loadData()
  }, [router])

  async function handleLogout() {
    if (profile) {
      await supabase.from('profiles').update({ sesi_aktif: false }).eq('id', profile.id);
    }
    
    localStorage.removeItem('petugas_session')
    localStorage.removeItem('mode_kerja')
    router.push('/login')
  }

  const formatRupiah = (angka: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka)
  }

  if (loading) return <p className="p-6 text-gray-900 font-bold">Memuat dashboard...</p>
  if (error) return <p className="p-6 text-red-600">Error: {error}</p>
  if (!profile) return null

  return (
    <div className="h-[100dvh] w-full bg-gray-100 p-3 md:p-6 flex flex-col overflow-hidden">
      <div className="max-w-4xl w-full mx-auto flex flex-col h-full">
        
        {/* HEADER */}
        <div className="flex justify-between items-start mb-4 md:mb-6 flex-shrink-0">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 leading-tight">Dashboard</h1>
            <h2 className="text-lg md:text-xl font-bold text-gray-700">Admin Utama</h2>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => router.push('/ganti-password')}
              className="bg-gray-600 text-white px-2 py-1.5 md:px-4 md:py-2 rounded hover:bg-gray-700 text-[10px] md:text-sm font-medium"
            >
              🔑 Ganti Password
            </button>
            <button
              onClick={handleLogout}
              className="bg-red-600 text-white px-3 py-1.5 md:px-4 md:py-2 rounded hover:bg-red-700 text-[10px] md:text-sm font-medium"
            >
              Logout
            </button>
          </div>
        </div>

        {/* KARTU PENJUALAN */}
        <div 
          onClick={() => router.push('/laporan-penjualan-admin')}
          className="bg-white rounded-xl shadow-md p-4 md:p-6 mb-4 md:mb-6 flex-shrink-0 cursor-pointer hover:bg-gray-50 transition border border-gray-200"
        >
          <p className="text-xs md:text-sm text-gray-500 mb-1">Penjualan {tanggalHariIni}</p>
          <div className="flex justify-between items-end">
            <p className="text-2xl md:text-4xl font-bold text-gray-900">{stat.total_pesanan_hari_ini} <span className="text-sm md:text-lg font-medium text-gray-600">Tiket</span></p>
            <p className="text-xl md:text-3xl font-bold text-blue-600">{formatRupiah(stat.total_pendapatan_hari_ini)}</p>
          </div>
        </div>

        {/* MENU GRID */}
        <div className="bg-white p-3 md:p-6 rounded shadow flex-1 flex flex-col overflow-hidden">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3 flex-1 overflow-y-auto content-start">
            
            <a href="/laporan-penjualan-admin" className="flex items-center justify-center h-16 md:h-24 p-2 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 text-center transition shadow-sm">
              <p className="font-bold text-xs md:text-sm text-blue-800">Laporan Penjualan</p>
            </a>

            <a href="/jadwal" className="flex items-center justify-center h-16 md:h-24 p-2 border border-orange-200 bg-orange-50 rounded-lg hover:bg-orange-100 text-center transition shadow-sm">
              <p className="font-bold text-xs md:text-sm text-orange-800">Lihat Jadwal</p>
            </a>

            <a href="/kapal" className="flex items-center justify-center h-16 md:h-24 p-2 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100 text-center transition shadow-sm">
              <p className="font-bold text-xs md:text-sm text-teal-800">Manajemen Kapal</p>
            </a>
            
            <a href="/petugas" className="flex items-center justify-center h-16 md:h-24 p-2 border border-rose-200 bg-rose-50 rounded-lg hover:bg-rose-100 text-center transition shadow-sm">
              <p className="font-bold text-xs md:text-sm text-rose-800">Manajemen Petugas</p>
            </a>

            <a href="/agen-tenant" className="flex items-center justify-center h-16 md:h-24 p-2 border border-purple-200 bg-purple-50 rounded-lg hover:bg-purple-100 text-center transition shadow-sm">
              <p className="font-bold text-xs md:text-sm text-purple-800">Manajemen Agen</p>
            </a>

            <a href="/rekap-bagi-hasil-kapal" className="flex items-center justify-center h-16 md:h-24 p-2 border border-green-200 bg-green-50 rounded-lg hover:bg-green-100 text-center transition shadow-sm">
              <p className="font-bold text-xs md:text-sm text-green-800">Rekap Bagi Hasil</p>
            </a>
            
            <a href="/audit" className="flex items-center justify-center h-16 md:h-24 p-2 border border-yellow-200 bg-yellow-50 rounded-lg hover:bg-yellow-100 text-center transition shadow-sm">
              <p className="font-bold text-xs md:text-sm text-yellow-800">Audit Log</p>
            </a>
            
            <a href="/pengaturan" className="flex items-center justify-center h-16 md:h-24 p-2 border border-gray-200 bg-gray-50 rounded-lg hover:bg-gray-100 text-center transition shadow-sm">
              <p className="font-bold text-xs md:text-sm text-gray-800">Pengaturan Sistem</p>
            </a>

          </div>
        </div>
      </div>
    </div>
  )
}