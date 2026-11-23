'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getProfile, getOperatorSession, type Profile } from '@/lib/supabase'
import { bulanSekarang } from '@/lib/periode'
import { muatLokasiAgen } from '@/lib/laporanFee'
import { muatRutePemilik, urutkanRute, ujungRute, type RuteKapal } from '@/lib/rute'
import { urutkanLokasi } from '@/lib/lokasi'

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

// Warna khusus kartu Laporan Fee (merah = fee).
const WARNA_FEE = [
  'bg-red-50 border-red-200 text-red-800 hover:bg-red-100',
  'bg-rose-50 border-rose-200 text-rose-800 hover:bg-rose-100'
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
  const [lokasiFee, setLokasiFee] = useState<string[]>([])


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

  // Ambil rute milik penyewa sendiri lewat sumber tunggal lib/rute.ts
  // (Master Rute + template Manajemen Jadwal + jadwal yang sudah ada).
  useEffect(() => {
    async function muatRute() {
      if (!profile) return
      const daftarRute = await muatRutePemilik(profile)
      setRuteList(urutkanRute(daftarRute))

      // Daerah untuk Laporan Fee = lokasi agen yang terdaftar di penyewa ini.
      const daftarLokasiFee = await muatLokasiAgen(profile)
      setLokasiFee(daftarLokasiFee)

      setRuteLoading(false)
    }
    muatRute()
  }, [profile])

  if (error) return <p className="p-6 text-center text-red-600 mt-10">{error}</p>
  if (loading || ruteLoading) return <p className="p-6 text-center text-gray-600 mt-10">Memuat...</p>
  if (!profile) return null

  const bulanAktif = bulanSekarang()

  // Daerah keberangkatan (asal) -> syarat Laporan Gabungan.
  const kotaAsal = Array.from(
    new Set(ruteList.map(r => (r.rute_asal || '').trim()).filter(Boolean))
  )

  // Daerah untuk kartu "Laporan <daerah>" = SEMUA ujung rute yang terdaftar,
  // asal DAN tujuan. Jadi rute Tarakan → Nunukan langsung memunculkan
  // "Laporan Tarakan" + "Laporan Nunukan" sejak diinput di Manajemen Jadwal,
  // walau arah balik belum dibuat dan belum ada penjualan sama sekali.
  const kotaList = urutkanLokasi(ujungRute(ruteList))
  const warnaKota = (idx: number) => WARNA_RUTE[idx % WARNA_RUTE.length]

  // Panel kanan untuk menu "Laporan Penjualan Daerah".
  const menuDaerah: Kartu[] = kotaList.map((kota, idx) => ({
    label: `Laporan ${kota}`,
    deskripsi: `Rekap penjualan keberangkatan dari ${kota}`,
    color: warnaKota(idx),
    link: `/laporan-penjualan-admin?menu=kota:${encodeURIComponent(kota)}`
  }))

  if (kotaAsal.length >= 2) {
    menuDaerah.push({
      label: 'Laporan Gabungan',
      deskripsi: `Perbandingan pendapatan ${kotaAsal.join(' & ')}`,
      color: 'bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100',
      link: '/laporan-penjualan-admin?menu=gabungan'
    })
  }

  const subMenu: { [key: string]: { judul: string; deskripsi: string; kartu: Kartu[]; kosong?: string } } = {}

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

  // Normalisasi tautan lama (bookmark / tombol Kembali versi sebelumnya):
  //   ?menu=tarakan            -> kota:Tarakan
  //   ?menu=fee:Tarakan        -> fee:agen:Tarakan
  const menuMentah = (menuParam || 'daerah').trim()
  let menu = menuMentah
  if (menu === 'tarakan') menu = 'kota:Tarakan'
  if (menu === 'tanjung-selor') menu = 'kota:Tanjung Selor'
  if (menu === 'kota:tarakan') menu = 'kota:Tarakan'
  if (menu === 'kota:tanjung-selor') menu = 'kota:Tanjung Selor'
  if (menu.startsWith('fee:') && menu !== 'fee:agen' && menu !== 'fee:platform' && !menu.startsWith('fee:agen:')) {
    menu = `fee:agen:${menu.slice('fee:'.length)}`
  }

  // Laporan Fee: 2 kartu (Agen & Platform), lalu turun ke detail masing-masing.
  // Selalu tampil (bukan hanya saat ada agen) supaya menu utama tetap 3 kartu.
  subMenu.fee = {
    judul: 'Laporan Fee',
    deskripsi: 'Pilih jenis fee yang ingin dilihat',
    kartu: [
      {
        label: 'Laporan Fee Agen',
        deskripsi: 'Fee per tiket untuk semua agen di setiap daerah (harian & bulanan)',
        color: WARNA_FEE[0],
        link: '/laporan-penjualan-admin?menu=fee:agen'
      },
      {
        label: 'Laporan Fee Platform',
        deskripsi: 'Fee platform dari penjualan offline dan online (harian & bulanan)',
        color: WARNA_FEE[1],
        link: '/laporan-penjualan-admin?menu=fee:platform'
      }
    ]
  }

  subMenu['fee:agen'] = {
    judul: 'Laporan Fee Agen',
    deskripsi: 'Pilih daerah untuk melihat fee agen',
    kartu: lokasiFee.map((lokasi, idx) => ({
      label: `Laporan Fee ${lokasi}`,
      deskripsi: 'Fee harian & bulanan semua agen di daerah ini',
      color: WARNA_FEE[idx % WARNA_FEE.length],
      link: `/laporan-penjualan-admin?menu=fee:agen:${encodeURIComponent(lokasi)}`
    })),
    kosong: 'Belum ada agen terdaftar. Tambahkan agen di Manajemen Agen untuk melihat laporan fee agen.'
  }

  lokasiFee.forEach((lokasi) => {
    const kartuFee: Kartu[] = [
      {
        label: 'Laporan Fee Harian',
        deskripsi: 'Rekap fee per jam & kapal untuk 1 tanggal',
        color: WARNA_FEE[0],
        link: `/laporan-fee-harian?lokasi=${encodeURIComponent(lokasi)}`
      },
      {
        label: 'Laporan Fee Bulanan',
        deskripsi: 'Rekap fee per tanggal & kapal dalam 1 bulan',
        color: WARNA_FEE[1],
        link: `/laporan-fee-bulanan?lokasi=${encodeURIComponent(lokasi)}`
      }
    ]
    subMenu[`fee:agen:${lokasi}`] = {
      judul: `Laporan Fee ${lokasi}`,
      deskripsi: 'Semua agen ditampilkan, fee dihitung per tiket dewasa',
      kartu: kartuFee
    }
  })

  subMenu['fee:platform'] = {
    judul: 'Laporan Fee Platform',
    deskripsi: 'Pilih kanal penjualan',
    kartu: [
      {
        label: 'Laporan Fee Offline',
        deskripsi: 'Fee platform dari penjualan agen, loket, mobile, dan petugas',
        color: WARNA_FEE[0],
        link: '/laporan-fee-platform?kanal=offline&mode=harian'
      },
      {
        label: 'Laporan Fee Online',
        deskripsi: 'Fee platform dari penjualan online (web)',
        color: WARNA_FEE[1],
        link: '/laporan-fee-platform?kanal=online&mode=harian'
      }
    ]
  }

  if (kotaAsal.length >= 2) {
    subMenu.gabungan = {
      judul: 'Laporan Gabungan',
      deskripsi: `${kotaAsal.join(' & ')} (daerah lain muncul otomatis)`,
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

  // Manifest = SEMUA daerah milik kapal penyewa. Satu kartu per daerah,
  // bukan per pasangan rute, supaya tidak muncul "Manifest Tarakan → Berau",
  // "Manifest Tarakan → Bunyu", dst.
  if (ruteList.length > 0) {
    subMenu.manifest = {
      judul: 'Manifest Kapal',
      deskripsi: 'Pilih daerah keberangkatan. Setiap kapal/tujuan tetap dipisah di dalam manifest.',
      kartu: kotaList.map((kota, idx) => ({
        label: `Manifest ${kota}`,
        deskripsi: `Semua keberangkatan dari ${kota}`,
        color: warnaKota(idx),
        link: `/superadmin/pusat-kontrol/admin/manifest?lokasi=${encodeURIComponent(kota)}`
      }))
    }
  }

  // Sidebar vertikal: 3 kartu utama (Daerah, Manifest, Fee).
  const navUtama = [
    {
      kunci: 'daerah',
      label: 'Laporan Penjualan Daerah',
      deskripsi: 'Kartu laporan per daerah',
      link: '/laporan-penjualan-admin?menu=daerah'
    },
    ...(ruteList.length > 0
      ? [{
          kunci: 'manifest',
          label: 'Manifest Kapal',
          deskripsi: 'Manifest per daerah keberangkatan',
          link: '/laporan-penjualan-admin?menu=manifest'
        }]
      : []),
    {
      kunci: 'fee',
      label: 'Laporan Fee',
      deskripsi: 'Fee agen & fee platform',
      link: '/laporan-penjualan-admin?menu=fee'
    }
  ]
  const navAktif = menu === 'manifest' ? 'manifest' : menu.startsWith('fee') ? 'fee' : 'daerah'

  // Menu induk untuk tombol Kembali (kosong = sudah di level teratas).
  const indukMenu =
    menu.startsWith('kota:') || menu === 'gabungan'
      ? 'daerah'
      : menu.startsWith('fee:agen:')
        ? 'fee:agen'
        : menu === 'fee:agen' || menu === 'fee:platform'
          ? 'fee'
          : ''

  const subAktif: { judul: string; deskripsi: string; kartu: Kartu[]; kosong?: string } | null =
    menu === 'daerah'
      ? { judul: 'Laporan Penjualan Daerah', deskripsi: 'Pilih daerah yang ingin dilihat', kartu: menuDaerah }
      : subMenu[menu] || null
  const menuTampil: Kartu[] = subAktif ? subAktif.kartu : menuDaerah

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">

        <div className="flex justify-between items-start gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Laporan Penjualan</h1>
            <p className="text-sm text-gray-600">Pilih jenis laporan yang ingin Anda lihat</p>
          </div>
          <button
            onClick={() => router.push(indukMenu ? `/laporan-penjualan-admin?menu=${encodeURIComponent(indukMenu)}` : '/dashboard')}
            className="text-sm text-blue-600 hover:underline bg-white px-3 py-1.5 rounded border border-gray-200"
          >
            &larr; Kembali
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 md:gap-6 items-start">
          {/* Sidebar vertikal (kiri) */}
          <aside className="flex flex-col gap-3 md:sticky md:top-4">
            {navUtama.map((nav) => (
              <button
                key={nav.kunci}
                onClick={() => router.push(nav.link)}
                className={`text-left p-4 rounded-xl border-2 transition-all shadow-sm ${
                  navAktif === nav.kunci
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-200 text-gray-900 hover:bg-gray-50'
                }`}
              >
                <p className="text-sm md:text-base font-bold">{nav.label}</p>
                <p className={`text-xs mt-1 ${navAktif === nav.kunci ? 'text-blue-100' : 'text-gray-500'}`}>
                  {nav.deskripsi}
                </p>
              </button>
            ))}
          </aside>

          {/* Panel kanan */}
          <main className="bg-white rounded-xl border border-gray-200 p-4 md:p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg md:text-xl font-bold text-gray-900">
                {subAktif?.judul || 'Laporan Penjualan Daerah'}
              </h2>
              <p className="text-xs md:text-sm text-gray-600">
                {subAktif?.deskripsi || 'Pilih daerah yang ingin dilihat'}
              </p>
            </div>

            {menuTampil.length === 0 ? (
              <div className="border border-dashed border-gray-300 rounded-xl p-6 text-center">
                <p className="text-sm text-gray-600">
                  {subAktif?.kosong ||
                    'Belum ada rute terdaftar untuk akun ini. Kartu laporan daerah muncul otomatis setelah rute diinput di Manajemen Jadwal atau Master Rute, walau belum ada penjualan.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                {menuTampil.map((kartu, idx) => (
                  <button
                    key={idx}
                    onClick={() => router.push(kartu.link)}
                    className={`flex flex-col items-start p-4 md:p-5 rounded-xl border-2 transition-all shadow-sm ${kartu.color}`}
                  >
                    <h3 className="text-base md:text-lg font-bold mb-1.5 text-left">{kartu.label}</h3>
                    <p className="text-xs md:text-sm opacity-80 text-left">{kartu.deskripsi}</p>
                  </button>
                ))}
              </div>
            )}
          </main>
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