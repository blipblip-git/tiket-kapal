'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, ambilNamaPerusahaan, type Profile } from '@/lib/supabase'
import { idOperator, ambilOperatorKapal, cocokOperator } from '@/lib/tenant'
import DashboardHeader from '@/components/DashboardHeader'

type StatistikRute = {
  rute: string
  dewasa: number
  balita: number
  pendapatan: number
}

export default function DashboardAdminPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [namaPerusahaan, setNamaPerusahaan] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [error, setError] = useState('')
  const [statPerRute, setStatPerRute] = useState<StatistikRute[]>([])
  const [tanggalHariIni, setTanggalHariIni] = useState('')

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
    menu_audit: 'Audit Log',
    menu_backup: 'Backup Data (Excel)',
  })

  useEffect(() => {
    const today = new Date()
    setTanggalHariIni(today.toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }))

    async function loadData() {
      if (reloadKey > 0) setRefreshing(true)

      const { data: textData } = await supabase
        .from('pengaturan_teks')
        .select('data_teks')
        .eq('role', 'admin_utama')
        .single()
      
      if (textData && textData.data_teks) {
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
      setProfile(p)
      setNamaPerusahaan(await ambilNamaPerusahaan(p))

      // Gunakan WITA (UTC+8) untuk tanggal hari ini
      const now = new Date()
      const witaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000))
      const hariIni = witaTime.toISOString().split('T')[0]
      
      const { data: pesananHariIni } = await supabase
        .from('pesanan')
        .select(`
          id, is_balita,
          jadwal:jadwal_id ( tanggal, harga, rute_asal, rute_tujuan, kapal_id, operator_id )
        `)
        .eq('status', 'paid')
        .eq('jadwal.tanggal', hariIni)

      const operatorId = idOperator(p)
      // Data lama bisa punya operator_id NULL — pemiliknya ditentukan dari kapal.
      const petaOperatorKapal = await ambilOperatorKapal(
        (pesananHariIni || []).map((item: any) => item.jadwal?.kapal_id)
      )

      const ruteMap: Record<string, StatistikRute> = {}

      if (pesananHariIni) {
        pesananHariIni.forEach((item: any) => {
          if (!item.jadwal) return;
          if (!cocokOperator(item.jadwal, operatorId, petaOperatorKapal)) return;

          const namaRute = `${item.jadwal.rute_asal} - ${item.jadwal.rute_tujuan}`
          
          if (!ruteMap[namaRute]) {
            ruteMap[namaRute] = { rute: namaRute, dewasa: 0, balita: 0, pendapatan: 0 }
          }

          if (item.is_balita) {
            ruteMap[namaRute].balita += 1
          } else {
            ruteMap[namaRute].dewasa += 1
            ruteMap[namaRute].pendapatan += (item.jadwal.harga || 0)
          }
        })
      }

      setStatPerRute(Object.values(ruteMap).sort((a, b) => b.pendapatan - a.pendapatan))
      setRefreshing(false)
      setLoading(false)
    }
    loadData()
  }, [router, reloadKey])

  async function handleLogout() {
    if (profile) {
      await supabase.from('profiles').update({ sesi_aktif: false }).eq('id', profile.id);
    }
    localStorage.removeItem('petugas_session')
    localStorage.removeItem('mode_kerja')
    router.push('/login')
  }

  const formatRupiah = (angka: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka)
  }

  if (loading) return <p className="p-6 text-gray-900 font-bold">Memuat dashboard...</p>
  if (error) return <p className="p-6 text-red-600">Error: {error}</p>
  if (!profile) return null

  const totalDewasa = statPerRute.reduce((sum, item) => sum + item.dewasa, 0)
  const totalBalita = statPerRute.reduce((sum, item) => sum + item.balita, 0)
  const totalPendapatanKeseluruhan = statPerRute.reduce((sum, item) => sum + item.pendapatan, 0)

  return (
    <div className="h-[100dvh] w-full bg-gray-100 p-3 md:p-6 flex flex-col overflow-hidden">
      <div className="max-w-4xl w-full mx-auto flex flex-col h-full">
        
        {/* HEADER (Format Seragam: Nama Perusahaan / Judul / Nama) */}
        <DashboardHeader
          namaPerusahaan={namaPerusahaan || profile.nama_perusahaan || profile.nama}
          judul={`${teks.judul_dashboard} ${teks.sub_judul}`}
          subJudul={profile.nama}
          onRefresh={() => setReloadKey((k) => k + 1)}
          refreshing={refreshing}
          aksi={
            <>
              <button onClick={() => router.push('/ganti-password')} className="bg-gray-600 text-white px-2 py-1.5 md:px-4 md:py-2 rounded hover:bg-gray-700 text-[10px] md:text-sm font-medium">
                {teks.tombol_ganti_password}
              </button>
              <button onClick={handleLogout} className="bg-red-600 text-white px-3 py-1.5 md:px-4 md:py-2 rounded hover:bg-red-700 text-[10px] md:text-sm font-medium">
                {teks.tombol_logout}
              </button>
            </>
          }
        />

        {/* KARTU PENJUALAN PER RUTE */}
        <div className="bg-white rounded-xl shadow-md p-4 md:p-6 mb-4 md:mb-6 flex-shrink-0 border border-gray-200">
          <p className="text-xs md:text-sm text-gray-500 mb-3 font-bold">Penjualan {tanggalHariIni}</p>
          
          {statPerRute.length === 0 ? (
            <p className="text-gray-400 text-sm italic text-center py-4">Belum ada penjualan hari ini.</p>
          ) : (
            <div className="space-y-3">
              {statPerRute.map((rute, idx) => (
                <div key={idx} className="flex flex-col md:flex-row md:justify-between md:items-center border-b border-gray-100 pb-2 last:border-0 last:pb-0 gap-1 md:gap-0">
                  <p className="font-bold text-gray-700 text-sm md:text-base w-full md:w-1/2">{rute.rute}</p>
                  <div className="flex justify-between md:justify-end md:gap-8 w-full md:w-1/2">
                    <p className="text-blue-600 font-bold text-sm md:text-base">Dewasa {rute.dewasa}, Balita {rute.balita}</p>
                    <p className="text-gray-900 font-bold text-sm md:text-lg">{formatRupiah(rute.pendapatan)}</p>
                  </div>
                </div>
              ))}
              
              {/* GARIS PEMISAH TOTAL */}
              <div className="pt-2 mt-2 border-t-2 border-gray-300 border-dashed">
                <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-1 md:gap-0">
                  <p className="font-extrabold text-gray-900 text-base md:text-lg w-full md:w-1/2">TOTAL</p>
                  <div className="flex justify-between md:justify-end md:gap-8 w-full md:w-1/2">
                    <p className="text-blue-700 font-extrabold text-base md:text-lg">Dewasa {totalDewasa}, Balita {totalBalita}</p>
                    <p className="text-blue-700 font-extrabold text-base md:text-xl">{formatRupiah(totalPendapatanKeseluruhan)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MENU GRID */}
        <div className="bg-white p-3 md:p-6 rounded shadow flex-1 flex flex-col overflow-hidden">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3 flex-1 overflow-y-auto content-start">
            
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