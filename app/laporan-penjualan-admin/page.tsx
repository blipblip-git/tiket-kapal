'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'
import { bulanSekarang } from '@/lib/periode'

type RuteKapal = { rute_asal: string; rute_tujuan: string }

const WARNA_RUTE = [
  'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100',
  'bg-green-50 border-green-200 text-green-800 hover:bg-green-100',
  'bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100',
  'bg-orange-50 border-orange-200 text-orange-800 hover:bg-orange-100',
]

// Rute bawaan platform. Dipakai kalau penyewa belum punya isi Master Rute
// maupun jadwal, supaya pilihan manifest tetap lengkap dua arah.
const RUTE_DEFAULT: RuteKapal[] = [
  { rute_asal: 'Tarakan', rute_tujuan: 'Tanjung Selor' },
  { rute_asal: 'Tanjung Selor', rute_tujuan: 'Tarakan' },
]

function LaporanPenjualanAdminContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const menuParam = searchParams.get('menu')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ruteList, setRuteList] = useState<RuteKapal[]>([])


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

  // Ambil daftar rute milik pemilik (operator), supaya kartu manifest mengikuti rute kapalnya
  useEffect(() => {
    async function muatRute() {
      if (!profile) return
      const operatorId = profile.role === 'superadmin' ? null : (profile.operator_id || profile.id)

      const kumpulan: RuteKapal[] = []

      let qRute = supabase.from('master_rute').select('rute_asal, rute_tujuan')
      if (operatorId) qRute = qRute.eq('operator_id', operatorId)
      const { data: dataRute } = await qRute
      ;(dataRute || []).forEach((r: any) => {
        if (r.rute_asal && r.rute_tujuan) kumpulan.push({ rute_asal: r.rute_asal, rute_tujuan: r.rute_tujuan })
      })

      // Cadangan: rute yang sudah pernah dipakai di jadwal operator ini
      if (kumpulan.length === 0) {
        let qJadwal = supabase.from('jadwal').select('rute_asal, rute_tujuan').limit(1000)
        if (operatorId) qJadwal = qJadwal.eq('operator_id', operatorId)
        const { data: dataJadwal } = await qJadwal
        ;(dataJadwal || []).forEach((j: any) => {
          if (j.rute_asal && j.rute_tujuan) kumpulan.push({ rute_asal: j.rute_asal, rute_tujuan: j.rute_tujuan })
        })
      }

      const unik = Array.from(new Map(kumpulan.map(r => [`${r.rute_asal}|${r.rute_tujuan}`, r])).values())
      unik.sort((a, b) => {
        if (a.rute_asal === b.rute_asal) return a.rute_tujuan.localeCompare(b.rute_tujuan)
        if (a.rute_asal === 'Tarakan') return -1
        if (b.rute_asal === 'Tarakan') return 1
        return a.rute_asal.localeCompare(b.rute_asal)
      })
      setRuteList(unik)
    }
    muatRute()
  }, [profile])

  if (loading) return <p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>
  if (error) return <p className="p-6 text-center text-red-600 mt-10">{error}</p>
  if (!profile) return null

  const bulanAktif = bulanSekarang()

  const menuUtama = [
    {
      label: 'Laporan Tarakan',
      deskripsi: 'Rekap penjualan keberangkatan dari Tarakan',
      color: 'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100',
      link: '/laporan-penjualan-admin?menu=tarakan'
    },
    {
      label: 'Laporan Tanjung Selor',
      deskripsi: 'Rekap penjualan keberangkatan dari Tanjung Selor',
      color: 'bg-green-50 border-green-200 text-green-800 hover:bg-green-100',
      link: '/laporan-penjualan-admin?menu=tanjung-selor'
    },
    {
      label: 'Laporan Gabungan',
      deskripsi: 'Perbandingan pendapatan Tarakan & Tanjung Selor',
      color: 'bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100',
      link: '/laporan-penjualan-admin?menu=gabungan'
    },
    {
      label: 'Manifest Kapal',
      deskripsi: 'Daftar penumpang dan status boarding (per rute)',
      color: 'bg-orange-50 border-orange-200 text-orange-800 hover:bg-orange-100',
      link: '/laporan-penjualan-admin?menu=manifest'
    }
  ]

  const subMenu: { [key: string]: { judul: string; deskripsi: string; kartu: typeof menuUtama } } = {
    'tarakan': {
      judul: 'Laporan Tarakan',
      deskripsi: 'Keberangkatan dari Tarakan',
      kartu: [
        {
          label: 'Laporan Penjualan Harian',
          deskripsi: 'Rekap per jam, petugas, dan rincian penumpang untuk 1 tanggal',
          color: 'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100',
          link: '/laporan?view=penjualan&lokasi=Tarakan'
        },
        {
          label: 'Laporan Penjualan Bulanan',
          deskripsi: 'Ringkasan per tanggal dalam 1 bulan (tanggal 1 s/d akhir bulan)',
          color: 'bg-indigo-50 border-indigo-200 text-indigo-800 hover:bg-indigo-100',
          link: `/laporan-bulanan?lokasi=Tarakan&bulan=${bulanAktif}`
        }
      ]
    },
    'tanjung-selor': {
      judul: 'Laporan Tanjung Selor',
      deskripsi: 'Keberangkatan dari Tanjung Selor',
      kartu: [
        {
          label: 'Laporan Penjualan Harian',
          deskripsi: 'Rekap per jam, petugas, dan rincian penumpang untuk 1 tanggal',
          color: 'bg-green-50 border-green-200 text-green-800 hover:bg-green-100',
          link: '/laporan?view=penjualan&lokasi=Tanjung%20Selor'
        },
        {
          label: 'Laporan Penjualan Bulanan',
          deskripsi: 'Ringkasan per tanggal dalam 1 bulan (tanggal 1 s/d akhir bulan)',
          color: 'bg-indigo-50 border-indigo-200 text-indigo-800 hover:bg-indigo-100',
          link: `/laporan-bulanan?lokasi=Tanjung%20Selor&bulan=${bulanAktif}`
        }
      ]
    },
    'gabungan': {
      judul: 'Laporan Gabungan',
      deskripsi: 'Tarakan & Tanjung Selor (daerah lain muncul otomatis)',
      kartu: [
        {
          label: 'Laporan Gabungan Harian',
          deskripsi: 'Perbandingan penjualan per jam untuk 1 tanggal',
          color: 'bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100',
          link: '/laporan-gabungan'
        },
        {
          label: 'Laporan Gabungan Bulanan',
          deskripsi: 'Ringkasan per tanggal + kolom daerah lain (mis. Nunukan) otomatis',
          color: 'bg-indigo-50 border-indigo-200 text-indigo-800 hover:bg-indigo-100',
          link: `/laporan-gabungan-bulanan?bulan=${bulanAktif}`
        }
      ]
    },
    'manifest': {
      judul: 'Manifest Kapal',
      deskripsi: 'Pilih rute keberangkatan untuk melihat manifest penumpang',
      kartu: (ruteList.length > 0 ? ruteList : RUTE_DEFAULT).map((r, idx) => ({
        label: `Manifest ${r.rute_asal}`,
        deskripsi: `Daftar penumpang rute ${r.rute_asal} → ${r.rute_tujuan}`,
        color: WARNA_RUTE[idx % WARNA_RUTE.length],
        link: `/superadmin/pusat-kontrol/admin/manifest?lokasi=${encodeURIComponent(r.rute_asal)}&tujuan=${encodeURIComponent(r.rute_tujuan)}`
      }))
    }
  }

  const subAktif = menuParam ? subMenu[menuParam] : null
  const menuTampil = subAktif ? subAktif.kartu : menuUtama

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{subAktif ? subAktif.judul : 'Laporan Penjualan'}</h1>
            <p className="text-sm text-gray-600">{subAktif ? subAktif.deskripsi : 'Pilih jenis laporan yang ingin Anda lihat'}</p>
          </div>
          <button onClick={() => router.push(subAktif ? '/laporan-penjualan-admin' : '/dashboard')} className="text-sm text-blue-600 hover:underline bg-white px-3 py-1.5 rounded border border-gray-200">
            &larr; Kembali
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {menuTampil.map((menu, idx) => (
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