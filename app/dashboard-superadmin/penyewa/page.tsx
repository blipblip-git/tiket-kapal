'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function DataPenyewaMenuPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cekSesi() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/superadmin')
        return
      }
      setLoading(false)
    }
    cekSesi()
  }, [router])

  if (loading) return <p className="p-6 text-center text-gray-400 bg-gray-900 min-h-screen flex items-center justify-center">Memuat...</p>

  return (
    <div className="min-h-screen bg-gray-900 p-6 flex flex-col items-center justify-center">
      <div className="w-full max-w-4xl">
        
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Data Penyewa</h1>
            <p className="text-sm text-gray-400">Kelola Pemilik Kapal yang menggunakan platform Anda.</p>
          </div>
          <button onClick={() => router.push('/dashboard-superadmin')} className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600 text-sm font-medium">
            &larr; Kembali
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          <button 
            onClick={() => router.push('/dashboard-superadmin/penyewa/daftar')}
            className="bg-gray-800 border border-gray-700 p-8 rounded-xl hover:bg-gray-750 transition text-left flex flex-col items-start h-48 justify-center shadow-lg group"
          >
            <div className="text-5xl mb-4 group-hover:scale-110 transition">🏢</div>
            <h2 className="text-xl font-bold text-white mb-2">Daftar Penyewa</h2>
            <p className="text-sm text-gray-400">Lihat daftar Pemilik Kapal, buat akun baru, dan atur kunci akses mereka.</p>
          </button>

          {/* Kartu Cadangan (bisa diisi nanti) */}
          <div className="bg-gray-800/50 border border-gray-700 border-dashed p-8 rounded-xl flex flex-col items-start h-48 justify-center">
            <div className="text-5xl mb-4 opacity-50">📦</div>
            <h2 className="text-xl font-bold text-gray-500 mb-2">Fitur Lain</h2>
            <p className="text-sm text-gray-500">Segera hadir.</p>
          </div>

        </div>
      </div>
    </div>
  )
}