'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, ambilNamaPerusahaan, hapusSesiAuthLokal, type Profile } from '@/lib/supabase'
import { idOperator, ambilOperatorKapal, cocokOperator } from '@/lib/tenant'
import DashboardHeader from '@/components/DashboardHeader'

/** Tanggal hari ini menurut WITA (UTC+8), bukan zona waktu browser. */
function tanggalWITA(): string {
  const now = new Date()
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** "2026-11-23" -> "Senin, 23 November 2026" tanpa bergeser karena timezone. */
function labelTanggal(tanggal: string): string {
  const cocok = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tanggal)
  if (!cocok) return tanggal
  const tanggalUtc = new Date(Date.UTC(Number(cocok[1]), Number(cocok[2]) - 1, Number(cocok[3])))
  return tanggalUtc.toLocaleDateString('id-ID', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC'
  })
}

type PesananDashboard = {
  id: string
  is_balita: boolean | null
  jadwal: {
    harga: number | null
    kapal_id: string | null
    operator_id?: string | null
  } | null
}

function DashboardAdminContent() {
  const router = useRouter()
  const inputTanggalRef = useRef<HTMLInputElement | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [namaPerusahaan, setNamaPerusahaan] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [error, setError] = useState('')
  const [totalPenjualan, setTotalPenjualan] = useState(0)
  const [tanggal, setTanggal] = useState(() => tanggalWITA())

  const [teks, setTeks] = useState({
    judul_dashboard: 'Dashboard',
    sub_judul: 'Admin Utama',
    tombol_ganti_password: '🔑 Ganti Password',
    tombol_logout: 'Logout',
    menu_kapal: 'Manajemen Kapal',
    menu_jadwal: 'Manajemen Jadwal',
    menu_petugas: 'Manajemen Petugas',
    menu_agen: 'Manajemen Agen',
    menu_pengaturan: 'Pengaturan Sistem',
    menu_laporan: 'Laporan Penjualan',
    menu_analisa: 'Laporan Analisa Penjualan',
    menu_audit: 'Audit Log',
    menu_backup: 'Backup Data (Excel)',
  })

  useEffect(() => {
    let masihAktif = true
    if (!tanggal) return

    async function loadData() {
      if (reloadKey > 0) setRefreshing(true)

      const { data: textData } = await supabase
        .from('pengaturan_teks')
        .select('data_teks')
        .eq('role', 'admin_utama')
        .single()

      if (textData && textData.data_teks && masihAktif) {
        setTeks(textData.data_teks)
      }

      let p = await getProfile()
      if (!p) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) p = sesiLokal as unknown as Profile
      }
      if (!p) {
        router.push('/login')
        return
      }
      if (p.role !== 'admin_utama') {
        setError('Anda tidak punya akses ke halaman ini')
        setLoading(false)
        return
      }
      if (!masihAktif) return
      setProfile(p)
      setNamaPerusahaan(await ambilNamaPerusahaan(p))

      const { data: pesananTanggal } = await supabase
        .from('pesanan')
        .select(`
          id, is_balita,
          jadwal:jadwal_id!inner ( tanggal, harga, rute_asal, rute_tujuan, kapal_id, operator_id )
        `)
        .eq('status', 'paid')
        .eq('jadwal.tanggal', tanggal)

      if (!masihAktif) return

      const daftarPesanan = (pesananTanggal || []) as unknown as PesananDashboard[]
      const operatorId = idOperator(p)
      // Data lama bisa punya operator_id NULL — pemiliknya ditentukan dari kapal.
      const petaOperatorKapal = await ambilOperatorKapal(
        daftarPesanan.map((item) => item.jadwal?.kapal_id)
      )

      let total = 0
      daftarPesanan.forEach((item) => {
        if (!item.jadwal) return
        if (!cocokOperator(item.jadwal, operatorId, petaOperatorKapal)) return
        // Balita tidak menambah pendapatan; hanya tiket dewasa yang dihitung.
        if (!item.is_balita) total += Number(item.jadwal.harga || 0)
      })

      setTotalPenjualan(total)
      setRefreshing(false)
      setLoading(false)
    }

    loadData()

    return () => {
      masihAktif = false
    }
  }, [router, reloadKey, tanggal])

  async function handleLogout() {
    if (profile) {
      await supabase.from('profiles').update({ sesi_aktif: false }).eq('id', profile.id);
    }
    localStorage.removeItem('petugas_session')
    localStorage.removeItem('mode_kerja')
    hapusSesiAuthLokal()
    router.push('/login')
  }

  const formatRupiah = (angka: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka)
  }

  const geserTanggal = (selisihHari: number) => {
    const cocok = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tanggal)
    const dasar = cocok
      ? new Date(Date.UTC(Number(cocok[1]), Number(cocok[2]) - 1, Number(cocok[3])))
      : new Date()
    dasar.setUTCDate(dasar.getUTCDate() + selisihHari)
    setTanggal(dasar.toISOString().slice(0, 10))
  }

  const bukaKalender = () => {
    const input = inputTanggalRef.current
    if (!input) return
    const denganPicker = input as HTMLInputElement & { showPicker?: () => void }
    if (typeof denganPicker.showPicker === 'function') {
      denganPicker.showPicker()
    } else {
      input.focus()
      input.click()
    }
  }

  if (loading) return <p className="p-6 text-gray-900 font-bold">Memuat dashboard...</p>
  if (error) return <p className="p-6 text-red-600">Error: {error}</p>
  if (!profile) return null

  return (
    <div className="min-h-[100dvh] w-full bg-gray-100 p-3 md:p-6 flex flex-col">
      <div className="max-w-4xl w-full mx-auto flex flex-col">

        {/* HEADER (Format Seragam: Nama Perusahaan / Judul / Nama) */}
        <DashboardHeader
          namaPerusahaan={namaPerusahaan || profile.nama_perusahaan || profile.nama}
          judul={`${teks.judul_dashboard} ${teks.sub_judul}`}
          subJudul={profile.nama}
          onRefresh={() => setReloadKey((k) => k + 1)}
          refreshing={refreshing}
          aksi={
            <>
              <button onClick={() => router.push('/ganti-password')} className="bg-gray-600 text-white px-3 py-2 rounded hover:bg-gray-700 text-xs md:text-sm font-medium whitespace-nowrap">
                {teks.tombol_ganti_password}
              </button>
              <button onClick={handleLogout} className="bg-red-600 text-white px-3 py-2 rounded hover:bg-red-700 text-xs md:text-sm font-medium whitespace-nowrap">
                {teks.tombol_logout}
              </button>
            </>
          }
        />

        {/* KARTU PENJUALAN */}
        <div className="bg-white rounded-xl shadow-md p-4 md:p-6 mb-4 md:mb-6 flex-shrink-0 border border-gray-200">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <p className="text-xs md:text-sm text-gray-500 font-bold">
              Penjualan {labelTanggal(tanggal)}
            </p>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => geserTanggal(-1)}
                aria-label="Hari sebelumnya"
                className="h-8 w-8 rounded border border-gray-300 bg-white text-gray-700 font-bold hover:bg-gray-50"
              >
                ‹
              </button>

              <div className="relative h-8 w-9">
                <input
                  ref={inputTanggalRef}
                  type="date"
                  value={tanggal}
                  onChange={(e) => {
                    if (e.target.value) setTanggal(e.target.value)
                  }}
                  aria-label="Pilih tanggal penjualan"
                  className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
                />
                <button
                  type="button"
                  onClick={bukaKalender}
                  aria-label="Buka kalender"
                  className="h-8 w-9 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                >
                  📅
                </button>
              </div>

              <button
                type="button"
                onClick={() => geserTanggal(1)}
                aria-label="Hari berikutnya"
                className="h-8 w-8 rounded border border-gray-300 bg-white text-gray-700 font-bold hover:bg-gray-50"
              >
                ›
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-2xl md:text-3xl font-extrabold text-gray-900">
              {formatRupiah(totalPenjualan)}
            </p>
            <button
              type="button"
              onClick={() => router.push(`/laporan-gabungan?tanggal=${tanggal}`)}
              className="self-start sm:self-auto text-sm font-bold text-blue-700 hover:text-blue-900 hover:underline"
            >
              (Rincian)
            </button>
          </div>
        </div>


        {/* MENU GRID */}
        <div className="bg-white p-3 md:p-6 rounded shadow flex flex-col">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3 content-start">

            <button onClick={() => router.push('/kapal')} className="flex items-center justify-center h-16 md:h-24 p-2 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100 text-center transition shadow-sm">
              <p className="font-bold text-xs md:text-sm text-teal-800">{teks.menu_kapal}</p>
            </button>

            <button onClick={() => router.push('/template-jadwal')} className="flex items-center justify-center h-16 md:h-24 p-2 border border-orange-200 bg-orange-50 rounded-lg hover:bg-orange-100 text-center transition shadow-sm">
              <p className="font-bold text-xs md:text-sm text-orange-800">{teks.menu_jadwal}</p>
            </button>

            <button onClick={() => router.push('/superadmin/pusat-kontrol/admin/petugas')} className="flex items-center justify-center h-16 md:h-24 p-2 border border-rose-200 bg-rose-50 rounded-lg hover:bg-rose-100 text-center transition shadow-sm">
              <p className="font-bold text-xs md:text-sm text-rose-800">{teks.menu_petugas}</p>
            </button>

            <button onClick={() => router.push('/agen-tenant')} className="flex items-center justify-center h-16 md:h-24 p-2 border border-purple-200 bg-purple-50 rounded-lg hover:bg-purple-100 text-center transition shadow-sm">
              <p className="font-bold text-xs md:text-sm text-purple-800">{teks.menu_agen}</p>
            </button>

            <button onClick={() => router.push('/pengaturan')} className="flex items-center justify-center h-16 md:h-24 p-2 border border-gray-200 bg-gray-50 rounded-lg hover:bg-gray-100 text-center transition shadow-sm">
              <p className="font-bold text-xs md:text-sm text-gray-800">{teks.menu_pengaturan}</p>
            </button>

            <button onClick={() => router.push('/laporan-penjualan-admin')} className="flex items-center justify-center h-16 md:h-24 p-2 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 text-center transition shadow-sm">
              <p className="font-bold text-xs md:text-sm text-blue-800">{teks.menu_laporan}</p>
            </button>

            <button onClick={() => router.push('/laporan-analisa')} className="flex items-center justify-center h-16 md:h-24 p-2 border border-cyan-200 bg-cyan-50 rounded-lg hover:bg-cyan-100 text-center transition shadow-sm">
              <p className="font-bold text-xs md:text-sm text-cyan-800">{teks.menu_analisa || 'Laporan Analisa Penjualan'}</p>
            </button>

            <button onClick={() => router.push('/audit')} className="flex items-center justify-center h-16 md:h-24 p-2 border border-yellow-200 bg-yellow-50 rounded-lg hover:bg-yellow-100 text-center transition shadow-sm">
              <p className="font-bold text-xs md:text-sm text-yellow-800">{teks.menu_audit}</p>
            </button>

            <button onClick={() => router.push('/backup-data')} className="flex items-center justify-center h-16 md:h-24 p-2 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 text-center transition shadow-sm">
              <p className="font-bold text-xs md:text-sm text-emerald-800">{teks.menu_backup || 'Backup Data (Excel)'}</p>
            </button>

          </div>
        </div>
      </div>
    </div>
  )
}

export default function DashboardAdminPage() {
  return (
    <Suspense fallback={<p className="p-6 text-gray-900 font-bold">Memuat dashboard...</p>}>
      <DashboardAdminContent />
    </Suspense>
  )
}