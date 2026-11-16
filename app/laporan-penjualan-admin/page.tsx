'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'

function LaporanPenjualanAdminContent() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function init() {
      let p = await getProfile()
      if (!p) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) p = sesiLokal as unknown as Profile
      }
      if (!p) { router.push('/login'); return }
      if (p.role !== 'admin_utama' && p.role !== 'superadmin') {
        setError('Anda tidak punya akses')
        setLoading(false)
        return
      }
      setProfile(p)
      setLoading(false)
    }
    init()
  }, [router])

  if (loading) return <p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>
  if (error) return <p className="p-6 text-center text-red-600 mt-10">{error}</p>
  if (!profile) return null

  const menuLaporan = [
    {
      label: 'Laporan Tarakan',
      deskripsi: 'Rekap penjualan keberangkatan dari Tarakan',
      color: 'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100',
      link: '/laporan?view=penjualan&lokasi=Tarakan'
    },
    {
      label: 'Laporan Tanjung Selor',
      deskripsi: 'Rekap penjualan keberangkatan dari Tanjung Selor',
      color: 'bg-green-50 border-green-200 text-green-800 hover:bg-green-100',
      link: '/laporan?view=penjualan&lokasi=Tanjung%20Selor'
    },
    {
      label: 'Laporan Gabungan',
      deskripsi: 'Perbandingan pendapatan Tarakan & Tanjung Selor',
      color: 'bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100',
      link: '/laporan-gabungan'
    },
    {
      label: 'Manifest Kapal',
      deskripsi: 'Daftar penumpang dan status boarding',
      color: 'bg-orange-50 border-orange-200 text-orange-800 hover:bg-orange-100',
      link: '/superadmin/pusat-kontrol/admin/manifest' // UBAH LINK KE SINI
    }
  ]

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Laporan Penjualan</h1>
            <p className="text-sm text-gray-600">Pilih jenis laporan yang ingin Anda lihat</p>
          </div>
          <button onClick={() => router.push('/dashboard')} className="text-sm text-blue-600 hover:underline bg-white px-3 py-1.5 rounded border border-gray-200">
            &larr; Kembali
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {menuLaporan.map((menu, idx) => (
            <button
              key={idx}
              onClick={() => router.push(menu.link)}
              className={`flex flex-col items-start p-6 rounded-xl border-2 transition-all shadow-sm ${menu.color}`}
            >
              <h2 className="text-xl font-bold mb-2">{menu.label}</h2>
              <p className="text-sm opacity-80 text-left">{menu.deskripsi}</p>
            </button>
          ))}
        </div>

      </div>
    </div>
  )
}

export default function LaporanPenjualanAdminPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>}>
      <LaporanPenjualanAdminContent />
    </Suspense>
  )
}