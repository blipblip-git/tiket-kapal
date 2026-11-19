'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getOperatorSession, type Profile } from '@/lib/supabase'

// Dashboard akun KOLEKTOR: penagih uang cash dari agen & petugas di lokasi
// yang sama (Tarakan / Tanjung Selor / KTT / dst).
// Kolektor hanya bisa membuka laporan penjualan harian; data disaring di server
// lewat /api/kolektor/laporan (tidak bisa ganti lokasi lewat URL).
export default function DashboardKolektorPage() {
  const router = useRouter()
  const [profil, setProfil] = useState<Profile | null>(null)

  useEffect(() => {
    const sesi = getOperatorSession()
    if (!sesi) {
      router.replace('/login')
      return
    }
    if (sesi.role !== 'kolektor') {
      router.replace('/pilih-mode')
      return
    }
    setProfil(sesi)
  }, [router])

  async function logout() {
    if (profil) {
      supabase.from('profiles').update({ sesi_aktif: false }).eq('id', profil.id).then()
    }
    localStorage.removeItem('petugas_session')
    localStorage.removeItem('mode_kerja')
    router.replace('/login')
  }

  if (!profil) return <p className="p-6 text-center text-gray-600">Memuat...</p>

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-md w-full mx-auto p-4">

        <div className="bg-white p-4 rounded-xl shadow-md border border-gray-100 mb-4">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h1 className="text-lg font-bold text-gray-900 leading-tight">Dashboard Kolektor</h1>
              <p className="text-sm text-gray-600 mt-1 font-medium">{profil.nama}</p>
              <p className="text-xs text-emerald-700 font-bold mt-1">📍 Lokasi Tugas: {profil.lokasi || '-'}</p>
            </div>
            <button onClick={logout} className="text-xs bg-red-600 text-white px-3 py-1.5 rounded font-bold shadow-sm hover:bg-red-700">
              Logout
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => router.push('/laporan?view=penjualan')}
            className="text-left bg-white p-4 rounded-xl shadow-sm border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 transition flex items-center gap-4"
          >
            <span className="text-3xl bg-emerald-50 w-14 h-14 flex items-center justify-center rounded-lg">📊</span>
            <span className="flex-1">
              <span className="block text-base font-bold text-gray-900">Laporan Penjualan Harian</span>
              <span className="block text-xs text-gray-600 mt-1">
                Penjualan agen &amp; petugas di lokasi {profil.lokasi || '-'} (cash / QRIS per petugas).
              </span>
            </span>
            <span className="text-gray-400 text-xl font-light">&rsaquo;</span>
          </button>
        </div>

        <p className="text-[11px] text-gray-500 mt-4 leading-snug">
          Data laporan diambil dari server dan hanya mencakup penjualan agen/petugas yang bertugas di lokasi Anda.
          Tekan tombol 🖨️ Cetak untuk mencetak langsung ke printer (atau simpan sebagai PDF).
        </p>

      </div>
    </div>
  )
}
