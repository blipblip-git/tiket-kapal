'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function PusatKontrolPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cekSesi() {
      // Pengecekan pakai Supabase Auth (sama kayak dashboard superadmin)
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
            <h1 className="text-2xl font-bold text-white">Pusat Kontrol Website</h1>
            <p className="text-sm text-gray-400">Pilih role untuk mengatur tampilan.</p>
          </div>
          <button onClick={() => router.push('/dashboard-superadmin')} className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600 text-sm font-medium">
            &larr; Kembali
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <button 
            onClick={() => router.push('/superadmin/pusat-kontrol/admin')}
            className="bg-gray-800 border border-gray-700 p-6 rounded-xl hover:bg-gray-750 transition text-left flex flex-col items-start h-40 justify-center shadow-lg group"
          >
            <div className="text-4xl mb-3 group-hover:scale-110 transition">👨‍💼</div>
            <h2 className="text-lg font-bold text-white mb-1">Admin Utama</h2>
            <p className="text-xs text-gray-400">Atur teks & tombol di dashboard Admin.</p>
          </button>

          <button 
            onClick={() => router.push('/superadmin/pusat-kontrol/petugas')}
            className="bg-gray-800 border border-gray-700 p-6 rounded-xl hover:bg-gray-750 transition text-left flex flex-col items-start h-40 justify-center shadow-lg group"
          >
            <div className="text-4xl mb-3 group-hover:scale-110 transition">📷</div>
            <h2 className="text-lg font-bold text-white mb-1">Petugas Keberangkatan</h2>
            <p className="text-xs text-gray-400">Atur teks & tombol di dashboard Petugas.</p>
          </button>

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