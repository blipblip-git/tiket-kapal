'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, logout, type Profile } from '@/lib/supabase'

export default function DashboardSuperadminPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/superadmin'); return }
      
      const { data: p, error: errP } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (errP || !p) {
        setError('Gagal memuat profil Superadmin.')
        setLoading(false)
        return
      }

      if (p.role !== 'superadmin') {
        await supabase.auth.signOut()
        router.push('/superadmin')
        return
      }

      setProfile(p as Profile)
      setLoading(false)
    }
    loadData()
  }, [router])

  async function handleLogout() {
    await logout()
    router.push('/superadmin')
  }

  if (loading) return <p className="p-6 text-center text-gray-400 bg-gray-900 min-h-screen">Memuat...</p>
  if (error) return <p className="p-6 text-center text-red-500 bg-gray-900 min-h-screen">{error}</p>
  if (!profile) return null

  return (
    <div className="min-h-screen bg-gray-900 p-6 text-white">
      <div className="max-w-5xl mx-auto">
        
        {/* HEADER */}
        <div className="flex justify-between items-center mb-8 bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
          <div>
            <h1 className="text-2xl font-bold tracking-wider">KANTOR PUSAT PLATFORM</h1>
            <p className="text-sm text-gray-400 mt-1">Super Admin: {profile.nama}</p>
          </div>
          <button onClick={handleLogout} className="text-sm bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 font-bold">
            LOGOUT
          </button>
        </div>

        {/* MENU KHUSUS SUPERADMIN */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          <button 
            onClick={() => router.push('/dashboard-superadmin/penyewa')}
            className="bg-gray-800 p-8 rounded-xl shadow-lg hover:bg-gray-700 transition border border-gray-700 text-left flex flex-col items-start h-48 justify-center group"
          >
            <div className="text-5xl mb-4 group-hover:scale-110 transition">🔑</div>
            <h2 className="text-xl font-bold text-white mb-2">Data Penyewa</h2>
            <p className="text-sm text-gray-400">Kelola Pemilik Kapal yang menggunakan platform Anda.</p>
          </button>

          <button 
            onClick={() => router.push('/superadmin/pusat-kontrol')}
            className="bg-gray-800 p-8 rounded-xl shadow-lg hover:bg-gray-700 transition border border-gray-700 text-left flex flex-col items-start h-48 justify-center group"
          >
            <div className="text-5xl mb-4 group-hover:scale-110 transition">🎛️</div>
            <h2 className="text-xl font-bold text-white mb-2">Pusat Kontrol Website</h2>
            <p className="text-sm text-gray-400">Atur teks & tampilan dashboard Admin, Petugas, dan Agen.</p>
          </button>

          <button 
            onClick={() => router.push('/superadmin/pusat-kontrol/online')}
            className="bg-gray-800 p-8 rounded-xl shadow-lg hover:bg-gray-700 transition border border-gray-700 text-left flex flex-col items-start h-48 justify-center group"
          >
            <div className="text-5xl mb-4 group-hover:scale-110 transition">🌐</div>
            <h2 className="text-xl font-bold text-white mb-2">Pusat Kendali Lintasair</h2>
            <p className="text-sm text-gray-400">Atur teks, ikon, dan tampilan halaman pembeli online.</p>
          </button>

          {/* KHUSUS SUPERADMIN: Fee platform dari semua penjualan offline */}
          <button 
            onClick={() => router.push('/dashboard-superadmin/penerimaan-fee')}
            className="bg-red-950 p-8 rounded-xl shadow-lg hover:bg-red-900 transition border border-red-800 text-left flex flex-col items-start h-48 justify-center group md:col-span-2"
          >
            <div className="text-5xl mb-4 group-hover:scale-110 transition">💰</div>
            <h2 className="text-xl font-bold text-white mb-2">Penerimaan Fee</h2>
            <p className="text-sm text-red-200">Laporan Fee Platform (harian &amp; bulanan) dari semua penjualan offline — khusus Superadmin.</p>
          </button>

          {/* KHUSUS SUPERADMIN: Backup data semua tenant (1 file Excel) */}
          <button
            onClick={() => router.push('/backup-data')}
            className="bg-emerald-950 p-8 rounded-xl shadow-lg hover:bg-emerald-900 transition border border-emerald-800 text-left flex flex-col items-start h-48 justify-center group md:col-span-2"
          >
            <div className="text-5xl mb-4 group-hover:scale-110 transition">💾</div>
            <h2 className="text-xl font-bold text-white mb-2">Backup Data (Excel)</h2>
            <p className="text-sm text-emerald-200">Unduh data platform (daftar tenant, master kota/rute, total fee) dalam satu file Excel — tanpa data penjualan tenant.</p>
          </button>

        </div>
      </div>
    </div>
  )
}