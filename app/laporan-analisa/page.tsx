'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getProfile, getOperatorSession, type Profile } from '@/lib/supabase'
import LaporanAnalisaPenjualanHarian from '@/components/analisa/LaporanAnalisaPenjualanHarian'
import LaporanAnalisaPenjualanBulanan from '@/components/analisa/LaporanAnalisaPenjualanBulanan'
import LaporanAnalisaKapal from '@/components/analisa/LaporanAnalisaKapal'

type KartuAnalisa = {
  menu: string
  label: string
  deskripsi: string
  color: string
}

const WARNA_KARTU = [
  'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100',
  'bg-teal-50 border-teal-200 text-teal-800 hover:bg-teal-100',
  'bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100',
  'bg-orange-50 border-orange-200 text-orange-800 hover:bg-orange-100'
]

function LaporanAnalisaContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const menu = (searchParams.get('menu') || '').trim()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function init() {
      let currentProfile = await getProfile()
      if (!currentProfile) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) currentProfile = sesiLokal
      }
      if (!currentProfile) {
        router.push('/login')
        return
      }
      if (currentProfile.role !== 'admin_utama' && currentProfile.role !== 'superadmin') {
        setError('Anda tidak punya akses ke halaman ini')
        setLoading(false)
        return
      }
      setProfile(currentProfile)
      setLoading(false)
    }
    init()
  }, [router])

  if (loading) return <p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>
  if (error) return <p className="p-6 text-center text-red-600 mt-10">{error}</p>
  if (!profile) return null

  if (menu === 'penjualan-harian') {
    return <LaporanAnalisaPenjualanHarian profile={profile} />
  }
  if (menu === 'penjualan-bulanan') {
    return <LaporanAnalisaPenjualanBulanan profile={profile} />
  }
  if (menu === 'kapal-harian') {
    return <LaporanAnalisaKapal profile={profile} mode="harian" />
  }
  if (menu === 'kapal-bulanan') {
    return <LaporanAnalisaKapal profile={profile} mode="bulanan" />
  }

  let judul = 'Laporan Analisa Penjualan'
  let deskripsi = 'Pilih jenis analisa penjualan yang ingin dilihat'
  let kartu: KartuAnalisa[] = [
    {
      menu: 'penjualan',
      label: 'Laporan Analisa Penjualan',
      deskripsi: 'Analisa penjualan harian & bulanan per daerah untuk mengetahui jenis penjualan tertinggi dan terendah.',
      color: WARNA_KARTU[0]
    },
    {
      menu: 'kapal',
      label: 'Laporan Analisa Penjualan Kapal',
      deskripsi: 'Perbandingan penjualan setiap kapal, lengkap dengan rute dan kontribusinya.',
      color: WARNA_KARTU[1]
    }
  ]
  let induk = '/dashboard'

  if (menu === 'penjualan') {
    judul = 'Laporan Analisa Penjualan'
    deskripsi = 'Pilih periode analisa penjualan'
    induk = '/laporan-analisa'
    kartu = [
      {
        menu: 'penjualan-harian',
        label: 'Analisa Penjualan Harian',
        deskripsi: 'Rekap semua penjualan daerah per jenis penjualan untuk 1 tanggal.',
        color: WARNA_KARTU[0]
      },
      {
        menu: 'penjualan-bulanan',
        label: 'Analisa Penjualan Bulanan',
        deskripsi: 'Matriks penjualan semua daerah dalam 1 bulan beserta persentasenya.',
        color: WARNA_KARTU[2]
      }
    ]
  }

  if (menu === 'kapal') {
    judul = 'Laporan Analisa Penjualan Kapal'
    deskripsi = 'Pilih periode analisa penjualan kapal'
    induk = '/laporan-analisa'
    kartu = [
      {
        menu: 'kapal-harian',
        label: 'Analisa Penjualan Kapal Harian',
        deskripsi: 'Peringkat penjualan kapal pada 1 tanggal.',
        color: WARNA_KARTU[1]
      },
      {
        menu: 'kapal-bulanan',
        label: 'Analisa Penjualan Kapal Bulanan',
        deskripsi: 'Peringkat penjualan kapal dalam 1 bulan.',
        color: WARNA_KARTU[3]
      }
    ]
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-5 mb-4">
          <div className="flex flex-wrap justify-between items-start gap-3">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">{judul}</h1>
              <p className="text-xs md:text-sm text-gray-600 mt-0.5">{deskripsi}</p>
            </div>
            <button
              onClick={() => router.push(induk)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded text-xs md:text-sm font-bold transition"
            >
              &larr; Kembali
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
          {kartu.map((item) => (
            <button
              key={item.menu}
              onClick={() => router.push(`/laporan-analisa?menu=${item.menu}`)}
              className={`flex flex-col items-start p-5 rounded-xl border-2 transition-all shadow-sm text-left ${item.color}`}
            >
              <h2 className="text-base md:text-lg font-bold mb-1.5">{item.label}</h2>
              <p className="text-xs md:text-sm opacity-80">{item.deskripsi}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function LaporanAnalisaPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>}>
      <LaporanAnalisaContent />
    </Suspense>
  )
}
