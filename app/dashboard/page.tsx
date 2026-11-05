'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, getOperatorSession, logout, type Profile } from '@/lib/supabase'

type Statistik = {
  total_kapal: number
  total_jadwal: number
  total_pesanan_hari_ini: number
  total_pendapatan_hari_ini: number
}

export default function DashboardAdminPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [stat, setStat] = useState<Statistik>({
    total_kapal: 0,
    total_jadwal: 0,
    total_pesanan_hari_ini: 0,
    total_pendapatan_hari_ini: 0,
  })

  useEffect(() => {
    async function loadData() {
      let p = await getProfile()

      if (!p) {
        const sesiLokal = getOperatorSession()
        if (sesiLokal) {
          p = sesiLokal as unknown as Profile
        }
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

      const { count: totalKapal } = await supabase
        .from('kapal')
        .select('*', { count: 'exact', head: true })

      const hariIni = new Date().toISOString().split('T')[0]
      const { count: totalJadwal } = await supabase
        .from('jadwal')
        .select('*', { count: 'exact', head: true })
        .eq('tanggal', hariIni)

      const { data: pesananHariIni } = await supabase
        .from('pesanan')
        .select('id, jadwal:jadwal_id ( tanggal, harga )')
        .eq('status', 'paid')
      
      let pesananCount = 0
      let pendapatan = 0

      if (pesananHariIni) {
        for (const p of pesananHariIni) {
          const jadwalData = p.jadwal as any
          if (jadwalData && jadwalData.tanggal === hariIni) {
            pesananCount++
            pendapatan += jadwalData.harga || 0
          }
        }
      }

      setStat({
        total_kapal: totalKapal || 0,
        total_jadwal: totalJadwal || 0,
        total_pesanan_hari_ini: pesananCount,
        total_pendapatan_hari_ini: pendapatan,
      })

      setLoading(false)
    }

    loadData()
  }, [router])

  async function handleLogout() {
    if (profile) {
      await supabase.from('profiles').update({ sesi_aktif: false }).eq('id', profile.id);
    }
    
    localStorage.removeItem('petugas_session')
    localStorage.removeItem('mode_kerja')
    router.push('/login')
  }

  if (loading) return <p className="p-6 text-gray-900">Memuat dashboard...</p>
  if (error) return <p className="p-6 text-red-600">Error: {error}</p>
  if (!profile) return null

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard Admin Utama</h1>
            <p className="text-sm text-gray-700">Sistem Manajemen Tiket Kapal</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push('/ganti-password')}
              className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 text-sm font-medium"
            >
              🔑 Ganti Password
            </button>
            <button
              onClick={handleLogout}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 text-sm font-medium"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded shadow">
            <p className="text-xs text-gray-700">Total Kapal</p>
            <p className="text-2xl font-bold text-gray-900">{stat.total_kapal}</p>
          </div>
          <div className="bg-white p-4 rounded shadow">
            <p className="text-xs text-gray-700">Jadwal Hari Ini</p>
            <p className="text-2xl font-bold text-gray-900">{stat.total_jadwal}</p>
          </div>
          <div className="bg-white p-4 rounded shadow">
            <p className="text-xs text-gray-700">Pesanan Hari Ini</p>
            <p className="text-2xl font-bold text-gray-900">{stat.total_pesanan_hari_ini}</p>
          </div>
          <div className="bg-white p-4 rounded shadow">
            <p className="text-xs text-gray-700">Pendapatan Hari Ini</p>
            <p className="text-lg font-bold text-blue-600">
              Rp {stat.total_pendapatan_hari_ini.toLocaleString('id-ID')}
            </p>
          </div>
        </div>

        <div className="bg-white p-6 rounded shadow">
          <h2 className="font-bold text-gray-900 mb-4">Menu</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            
            <a href="/jadwal" className="block p-4 border rounded hover:bg-gray-50">
              <p className="font-medium text-gray-900">Lihat Jadwal</p>
              <p className="text-xs text-gray-700">Halaman jadwal publik</p>
            </a>

            <a href="/kapal" className="block p-4 border rounded hover:bg-gray-50">
              <p className="font-medium text-gray-900">Manajemen Kapal</p>
              <p className="text-xs text-gray-700">Tambah/edit armada, atur kapal cadangan & rusak</p>
            </a>
            
            <a href="/template-jadwal" className="block p-4 border rounded hover:bg-gray-50">
              <p className="font-medium text-gray-900">Template Jadwal</p>
              <p className="text-xs text-gray-700">Atur jam regulasi & interval keberangkatan</p>
            </a>
            
            <a href="/petugas" className="block p-4 border rounded hover:bg-gray-50">
              <p className="font-medium text-gray-900">Manajemen Petugas</p>
              <p className="text-xs text-gray-700">Tambah, atur password, & hapus petugas</p>
            </a>

            <a href="/agen-tenant" className="block p-4 border rounded hover:bg-gray-50 border-purple-300 bg-purple-50">
              <p className="font-medium text-purple-800">Manajemen Agen</p>
              <p className="text-xs text-purple-600">Buat akun agen khusus untuk menjual tiket kapal Anda</p>
            </a>

            {/* MENU LAPORAN PENJUALAN (MENGGANTIKAN OPERATOR KEBERANGKATAN) */}
            <a href="/laporan-penjualan-admin" className="block p-4 border rounded hover:bg-gray-50 border-blue-300 bg-blue-50">
              <p className="font-medium text-blue-800">Laporan Penjualan</p>
              <p className="text-xs text-blue-600">Lihat rekap penjualan tiket Online, Agen, & Operator</p>
            </a>

            <a href="/rekap-bagi-hasil-kapal" className="block p-4 border rounded hover:bg-gray-50 border-green-300 bg-green-50">
              <p className="font-medium text-green-800">Rekap Bagi Hasil</p>
              <p className="text-xs text-green-600">Lihat fee sistem & jatah pemilik kapal</p>
            </a>
            
            <a href="/audit" className="block p-4 border rounded hover:bg-gray-50">
              <p className="font-medium text-gray-900">Audit Log</p>
              <p className="text-xs text-gray-700">Riwayat aksi finansial petugas</p>
            </a>
            
            <a href="/pengaturan" className="block p-4 rounded hover:bg-gray-50 border border-gray-200">
              <p className="font-medium text-gray-900">Pengaturan Sistem</p>
              <p className="text-xs text-gray-700">Atur jam kerja & auto-logout petugas</p>
            </a>

          </div>
        </div>
      </div>
    </div>
  )
}