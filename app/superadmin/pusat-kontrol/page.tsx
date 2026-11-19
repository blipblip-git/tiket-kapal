'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'

export default function PusatKontrolPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    async function cekSesi() {
      // 1. Cek Supabase Auth (Superadmin)
      const { data: { user } } = await supabase.auth.getUser()
      
      // 2. Cek Custom Session (Agen/Petugas)
      let p = await getProfile()
      if (!p) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) p = sesiLokal as unknown as Profile
      }

      // Kalau DUA-DUANYA kosong, baru tendang ke login
      if (!user && !p) {
        router.push('/superadmin')
        return
      }

      setProfile(p)
      setLoading(false)
    }
    cekSesi()
  }, [router])

  if (loading) return <p className="p-6 text-center text-gray-400 bg-gray-900 min-h-screen flex items-center justify-center">Memuat...</p>

  return (
    <div className="min-h-screen bg-gray-900 p-6 flex flex-col items-center justify-center">
      <div className="w-full max-w-5xl">
        
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Pusat Kontrol Website</h1>
            <p className="text-sm text-gray-400">Mother File: Atur tampilan dasar untuk semua kamar penyewa.</p>
          </div>
          <button onClick={() => router.push(profile?.role === 'agen' || profile?.role === 'terminal_keberangkatan' ? '/dashboard' : '/dashboard-superadmin')} className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600 text-sm font-medium">
            &larr; Kembali
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* 1. KAMUS KOTA */}
          <button 
            onClick={() => router.push('/superadmin/pusat-kontrol/kota')}
            className="bg-gray-800 border border-gray-700 p-6 rounded-xl hover:bg-gray-750 transition text-left flex flex-col items-start h-40 justify-center shadow-lg group"
          >
            <div className="text-4xl mb-3 group-hover:scale-110 transition">📍</div>
            <h2 className="text-lg font-bold text-white mb-1">Master Rute (Daerah)</h2>
            <p className="text-xs text-gray-400">Daftar daerah tujuan untuk semua penyewa + singkatan cetak.</p>
          </button>

          {/* 2. ADMIN UTAMA */}
          <button 
            onClick={() => router.push('/superadmin/pusat-kontrol/admin')}
            className="bg-gray-800 border border-gray-700 p-6 rounded-xl hover:bg-gray-750 transition text-left flex flex-col items-start h-40 justify-center shadow-lg group"
          >
            <div className="text-4xl mb-3 group-hover:scale-110 transition">👨‍💼</div>
            <h2 className="text-lg font-bold text-white mb-1">Admin Utama</h2>
            <p className="text-xs text-gray-400">Atur teks & tombol di dashboard Admin.</p>
          </button>

          {/* 3. PETUGAS */}
          <button 
            onClick={() => router.push('/superadmin/pusat-kontrol/admin/petugas')}
            className="bg-gray-800 border border-gray-700 p-6 rounded-xl hover:bg-gray-750 transition text-left flex flex-col items-start h-40 justify-center shadow-lg group"
          >
            <div className="text-4xl mb-3 group-hover:scale-110 transition">📷</div>
            <h2 className="text-lg font-bold text-white mb-1">Petugas Keberangkatan</h2>
            <p className="text-xs text-gray-400">Kelola akun & lokasi petugas keberangkatan.</p>
          </button>

          {/* 4. AGEN */}
          <button 
            onClick={() => router.push('/superadmin/pusat-kontrol/agen')}
            className="bg-gray-800 border border-gray-700 p-6 rounded-xl hover:bg-gray-750 transition text-left flex flex-col items-start h-40 justify-center shadow-lg group"
          >
            <div className="text-4xl mb-3 group-hover:scale-110 transition">🤝</div>
            <h2 className="text-lg font-bold text-white mb-1">Agen</h2>
            <p className="text-xs text-gray-400">Atur teks & tombol di dashboard Agen.</p>
          </button>

        </div>
      </div>
    </div>
  )
}