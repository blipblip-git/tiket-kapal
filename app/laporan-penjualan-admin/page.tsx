'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, type Profile } from '@/lib/supabase'
import { bulanSekarang } from '@/lib/periode'
import { idOperator, ambilOperatorKapal, cocokOperator } from '@/lib/tenant'

type RuteKapal = { rute_asal: string; rute_tujuan: string }

type Kartu = {
  label: string
  deskripsi: string
  color: string
  link: string
}

const WARNA_RUTE = [
  'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100',
  'bg-green-50 border-green-200 text-green-800 hover:bg-green-100',
  'bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100',
  'bg-orange-50 border-orange-200 text-orange-800 hover:bg-orange-100',
]

function LaporanPenjualanAdminContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const menuParam = searchParams.get('menu')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ruteList, setRuteList] = useState<RuteKapal[]>([])
  const [ruteLoading, setRuteLoading] = useState(true)


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

  // Ambil rute milik penyewa sendiri (Master Rute, cadangan: jadwal kapalnya).
  // Tidak ada rute bawaan: kalau penyewa belum input, daftar ini kosong.
  useEffect(() => {
    async function muatRute() {
      if (!profile) return
      const operatorId = idOperator(profile)

      const kumpulan: RuteKapal[] = []

      let qRute = supabase.from('master_rute').select('rute_asal, rute_tujuan, operator_id').order('created_at', { ascending: true })
      if (operatorId) qRute = qRute.eq('operator_id', operatorId)
      const { data: dataRute } = await qRute
      ;(dataRute || []).forEach((r: any) => {
        if (r.rute_asal && r.rute_tujuan) kumpulan.push({ rute_asal: r.rute_asal, rute_tujuan: r.rute_tujuan })
      })

      // Rute dari Manajemen Jadwal (template). Form jadwal sekarang TIDAK lagi
      // mengisi master_rute, jadi ini sumber utama kartu untuk penyewa baru.
      let qTemplate = supabase.from('template_jadwal').select('rute_asal, rute_tujuan, kapal_id, operator_id')
      if (operatorId) qTemplate = qTemplate.eq('operator_id', operatorId)
      const { data: dataTemplate } = await qTemplate
      const petaOperatorKapalTemplate = await ambilOperatorKapal(
        (dataTemplate || []).map((t: any) => t.kapal_id)
      )
      ;(dataTemplate || []).forEach((t: any) => {
        if (!t.rute_asal || !t.rute_tujuan) return
        if (!cocokOperator(t, operatorId, petaOperatorKapalTemplate)) return
        kumpulan.push({ rute_asal: t.rute_asal, rute_tujuan: t.rute_tujuan })
      })

      // Rute yang sudah pernah dipakai di jadwal milik penyewa ini
      // (termasuk jadwal lama yang operator_id-nya NULL).
      const { data: dataJadwal } = await supabase
        .from('jadwal')
        .select('rute_asal, rute_tujuan, kapal_id, operator_id')
        .limit(1000)
      const petaOperatorKapal = await ambilOperatorKapal(
        (dataJadwal || []).map((j: any) => j.kapal_id)
      )
      ;(dataJadwal || []).forEach((j: any) => {
        if (!j.rute_asal || !j.rute_tujuan) return
        if (!cocokOperator(j, operatorId, petaOperatorKapal)) return
        kumpulan.push({ rute_asal: j.rute_asal, rute_tujuan: j.rute_tujuan })
      })

      const unik = Array.from(new Map(kumpulan.map(r => [`${r.rute_asal}|${r.rute_tujuan}`, r])).values())
      // Urutan mengikuti urutan input penyewa (bukan urutan nama daerah).
      setRuteList(unik)
      setRuteLoading(false)
    }
    muatRute()
  }, [profile])

  if (error) return <p className="p-6 text-center text-red-600 mt-10">{error}</p>
  if (loading || ruteLoading) return <p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>
  if (!profile) return null

  const bulanAktif = bulanSekarang()

  // Semua kartu dibentuk dari data milik penyewa sendiri (Master Rute, atau
  // jadwal kapalnya sebagai cadangan). Penyewa baru / belum input = tanpa kartu.
  const kotaList = Array.from(new Set(ruteList.map(r => r.rute_asal)))
  const warnaKota = (idx: number) => WARNA_RUTE[idx % WARNA_RUTE.length]

  const menuUtama: Kartu[] = kotaList.map((kota, idx) => ({
    label: `Laporan ${kota}`,
    deskripsi: `Rekap penjualan keberangkatan dari ${kota}`,
    color: warnaKota(idx),
    link: `/laporan-penjualan-admin?menu=kota:${encodeURIComponent(kota)}`
  }))

  if (kotaList.length >= 2) {
    menuUtama.push({
      label: 'Laporan Gabungan',
      deskripsi: `Perbandingan pendapatan ${kotaList.join(' & ')}`,
      color: 'bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100',
      link: '/laporan-penjualan-admin?menu=gabungan'
    })
  }

  if (ruteList.length > 0) {
    menuUtama.push({
      label: 'Manifest Kapal',
      deskripsi: 'Daftar penumpang dan status boarding (per rute)',
      color: 'bg-orange-50 border-orange-200 text-orange-800 hover:bg-orange-100',
      link: '/laporan-penjualan-admin?menu=manifest'
    })
  }

  const subMenu: { [key: string]: { judul: string; deskripsi: string; kartu: Kartu[] } } = {}

  kotaList.forEach((kota, idx) => {
    subMenu[`kota:${kota}`] = {
      judul: `Laporan ${kota}`,
      deskripsi: `Keberangkatan dari ${kota}`,
      kartu: [
        {
          label: 'Laporan Penjualan Harian',
          deskripsi: 'Rekap per jam, petugas, dan rincian penumpang untuk 1 tanggal',
          color: warnaKota(idx),
          link: `/laporan?view=penjualan&lokasi=${encodeURIComponent(kota)}`
        },
        {
          label: 'Laporan Penjualan Bulanan',
          deskripsi: 'Ringkasan per tanggal dalam 1 bulan (tanggal 1 s/d akhir bulan)',
          color: 'bg-indigo-50 border-indigo-200 text-indigo-800 hover:bg-indigo-100',
          link: `/laporan-bulanan?lokasi=${encodeURIComponent(kota)}&bulan=${bulanAktif}`
        }
      ]
    }
  })

  // Kompatibilitas tautan lama (bookmark / tombol Kembali versi sebelumnya).
  const aliasMenuLama: { [slug: string]: string } = {
    tarakan: 'Tarakan',
    'tanjung-selor': 'Tanjung Selor'
  }
  Object.entries(aliasMenuLama).forEach(([slug, kota]) => {
    const menuKota = subMenu[`kota:${kota}`]
    if (menuKota) subMenu[slug] = menuKota
  })

  if (kotaList.length >= 2) {
    subMenu.gabungan = {
      judul: 'Laporan Gabungan',
      deskripsi: `${kotaList.join(' & ')} (daerah lain muncul otomatis)`,
      kartu: [
        {
          label: 'Laporan Gabungan Harian',
          deskripsi: 'Perbandingan penjualan per jam untuk 1 tanggal',
          color: 'bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100',
          link: '/laporan-gabungan'
        },
        {
          label: 'Laporan Gabungan Bulanan',
          deskripsi: 'Ringkasan per tanggal + kolom daerah lain otomatis',
          color: 'bg-indigo-50 border-indigo-200 text-indigo-800 hover:bg-indigo-100',
          link: `/laporan-gabungan-bulanan?bulan=${bulanAktif}`
        }
      ]
    }
  }

  if (ruteList.length > 0) {
    subMenu.manifest = {
      judul: 'Manifest Kapal',
      deskripsi: 'Pilih rute keberangkatan untuk melihat manifest penumpang',
      kartu: ruteList.map((r, idx) => ({
        label: `Manifest ${r.rute_asal}`,
        deskripsi: `Daftar penumpang rute ${r.rute_asal} → ${r.rute_tujuan}`,
        color: warnaKota(idx),
        link: `/superadmin/pusat-kontrol/admin/manifest?lokasi=${encodeURIComponent(r.rute_asal)}&tujuan=${encodeURIComponent(r.rute_tujuan)}`
      }))
    }
  }

  const subAktif = menuParam ? subMenu[menuParam] : null
  const menuTampil: Kartu[] = subAktif ? subAktif.kartu : menuUtama

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

        {menuTampil.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <p className="text-sm text-gray-600">
              Belum ada data rute untuk akun ini. Kartu laporan akan muncul otomatis setelah
              pemilik kapal menambahkan rute dan jadwal kapal.
            </p>
          </div>
        ) : (
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
        )}

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