'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'

export default function LaporanPenjualanAdminPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [kapalCount, setKapalCount] = useState(0)

  useEffect(() => {
    async function init() {
      let p = await getProfile()
      if (!p) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) p = sesiLokal as unknown as Profile
      }

      if (!p || p.role !== 'admin_utama') {
        router.push('/login')
        return
      }

      setProfile(p)

      // Cek apakah penyewa ini udah punya kapal atau belum
      const { data: kapalData } = await supabase
        .from('kapal')
        .select('id')
        .eq('operator_id', p.id)
      
      setKapalCount(kapalData?.length || 0)
      setLoading(false)
    }
    init()
  }, [router])

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat...</p>
  if (!profile) return null

  return (
    <div className="h-[100dvh] w-full bg-gray-100 p-3 md:p-6 flex flex-col overflow-hidden">
      <div className="max-w-3xl w-full mx-auto flex flex-col h-full">
        
        {/* HEADER */}
        <div className="flex justify-between items-center mb-4 md:mb-6 bg-white p-3 md:p-5 rounded-xl shadow-sm border border-gray-200 flex-shrink-0">
          <h1 className="text-lg md:text-2xl font-bold text-gray-900">Laporan Penjualan</h1>
          <button onClick={() => router.push('/dashboard')} className="text-[10px] md:text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-md font-medium transition">
            &larr; Kembali
          </button>
        </div>

        {/* MENU KARTU */}
        <div className="flex flex-col gap-3 md:gap-4 flex-1 justify-center pb-8 overflow-y-auto">
          
          {kapalCount === 0 ? (
            <div className="bg-white p-8 rounded-xl border border-gray-200 text-center shadow-sm">
              <div className="text-5xl mb-4">📭</div>
              <h2 className="text-lg font-bold text-gray-800 mb-2">Belum Ada Data</h2>
              <p className="text-sm text-gray-500">Anda belum menambahkan armada kapal. Silakan tambahkan kapal terlebih dahulu di menu Manajemen Kapal.</p>
            </div>
          ) : (
            <>
              {/* KARTU TARAKAN */}
              <button 
                onClick={() => router.push('/laporan?view=penjualan&lokasi=Tarakan')}
                className="w-full bg-blue-50 border border-blue-200 p-4 md:p-6 rounded-xl shadow-sm hover:bg-blue-100 transition text-center flex items-center justify-center h-20 md:h-24 flex-shrink-0"
              >
                <h2 className="text-base md:text-xl font-bold text-blue-900">Laporan Tarakan</h2>
              </button>

              {/* KARTU TANJUNG SELOR */}
              <button 
                onClick={() => router.push('/laporan?view=penjualan&lokasi=Tanjung Selor')}
                className="w-full bg-orange-50 border border-orange-200 p-4 md:p-6 rounded-xl shadow-sm hover:bg-orange-100 transition text-center flex items-center justify-center h-20 md:h-24 flex-shrink-0"
              >
                <h2 className="text-base md:text-xl font-bold text-orange-900">Laporan Tanjung Selor</h2>
              </button>

              {/* KARTU LAPORAN GABUNGAN */}
              <button 
                onClick={() => router.push('/laporan-gabungan')}
                className="w-full bg-green-50 border border-green-200 p-4 md:p-6 rounded-xl shadow-sm hover:bg-green-100 transition text-center flex items-center justify-center h-20 md:h-24 flex-shrink-0"
              >
                <h2 className="text-base md:text-xl font-bold text-green-900">Laporan Gabungan</h2>
              </button>

              {/* KARTU LAPORAN MANIFEST */}
              <button 
                onClick={() => router.push('/laporan-manifest')}
                className="w-full bg-purple-50 border border-purple-200 p-4 md:p-6 rounded-xl shadow-sm hover:bg-purple-100 transition text-center flex items-center justify-center h-20 md:h-24 flex-shrink-0"
              >
                <h2 className="text-base md:text-xl font-bold text-purple-900">Laporan Manifest</h2>
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  )
}