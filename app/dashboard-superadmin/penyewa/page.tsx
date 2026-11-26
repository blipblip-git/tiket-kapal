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
            <h2 className="text-xl font-bold text-white mb-2">Daftar Penyewa Real</h2>
            <p className="text-sm text-gray-400">Pemilik Kapal di database produksi. Buat akun, atur akses, dan kelola penyewa real.</p>
          </button>

          <button
            onClick={() => router.push('/dashboard-superadmin/penyewa/demo')}
            className="bg-amber-950 border border-amber-800 p-8 rounded-xl hover:bg-amber-900 transition text-left flex flex-col items-start h-48 justify-center shadow-lg group"
          >
            <div className="text-5xl mb-4 group-hover:scale-110 transition">🧪</div>
            <h2 className="text-xl font-bold text-white mb-2">Daftar Penyewa Demo</h2>
            <p className="text-sm text-amber-200">Penyewa di environment demo. Dibaca dari database demo, bukan dari data real. Demo tidak punya Superadmin.</p>
          </button>

        </div>
      </div>
    </div>
  )
}