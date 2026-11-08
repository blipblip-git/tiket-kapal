'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getProfile, getOperatorSession, type Profile } from '@/lib/supabase'

export default function LaporanManifestPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      let p = await getProfile()
      if (!p) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) p = sesiLokal as unknown as Profile
      }

      if (!p) {
        router.push('/login')
        return
      }

      setProfile(p)
      setLoading(false)
    }
    init()
  }, [router])

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat...</p>
  if (!profile) return null

  const tanggalHariIni = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div className="h-[100dvh] w-full bg-gray-100 p-3 md:p-6 flex flex-col overflow-hidden">
      <div className="max-w-3xl w-full mx-auto flex flex-col h-full">
        
        {/* HEADER */}
        <div className="flex justify-between items-start mb-4 md:mb-6 bg-white p-3 md:p-5 rounded-xl shadow-sm border border-gray-200 flex-shrink-0">
          <div>
            <h1 className="text-lg md:text-2xl font-bold text-gray-900">Laporan Manifest</h1>
            <p className="text-xs md:text-sm font-bold text-blue-600 mt-0.5">{tanggalHariIni} (hari ini)</p>
          </div>
          <button onClick={() => router.push('/laporan-penjualan-admin')} className="text-[10px] md:text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-md font-medium transition">
            &larr; Kembali
          </button>
        </div>

        {/* MENU KARTU */}
        <div className="flex flex-col gap-3 md:gap-4 flex-1 justify-center pb-8">
          
          {/* KARTU MANIFEST TARAKAN */}
          <button 
            onClick={() => router.push('/laporan-manifest/detail?lokasi=Tarakan')}
            className="w-full bg-blue-50 border border-blue-200 p-4 md:p-6 rounded-xl shadow-sm hover:bg-blue-100 transition text-center flex items-center justify-center h-24 md:h-32"
          >
            <h2 className="text-base md:text-xl font-bold text-blue-900">Manifest Tarakan</h2>
          </button>

          {/* KARTU MANIFEST TANJUNG SELOR */}
          <button 
            onClick={() => router.push('/laporan-manifest/detail?lokasi=Tanjung Selor')}
            className="w-full bg-orange-50 border border-orange-200 p-4 md:p-6 rounded-xl shadow-sm hover:bg-orange-100 transition text-center flex items-center justify-center h-24 md:h-32"
          >
            <h2 className="text-base md:text-xl font-bold text-orange-900">Manifest Tanjung Selor</h2>
          </button>

        </div>
      </div>
    </div>
  )
}