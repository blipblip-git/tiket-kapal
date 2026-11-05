'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { logoutOperator, getOperatorSession, type Profile } from '@/lib/supabase'

export default function DashboardTerminalPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const sesi = getOperatorSession()
    if (!sesi) {
      router.push('/login')
      return
    }
    if (sesi.role !== 'terminal_keberangkatan' && sesi.role !== 'admin_utama') {
      router.push('/pilih-mode')
      return
    }
    setProfile(sesi)
    setLoading(false)
  }, [router])

  function handleLogout() {
    logoutOperator()
  }

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat...</p>
  if (!profile) return null

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Ruang Kerja Keberangkatan</h1>
            <p className="text-sm text-gray-700">Petugas: {profile.nama} • Lokasi: {profile.lokasi}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { localStorage.removeItem('mode_kerja'); router.push('/pilih-mode') }}
              className="bg-gray-600 text-white px-3 py-2 rounded hover:bg-gray-700 text-xs"
            >
              Ganti Mode
            </button>
            <button onClick={handleLogout} className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 text-sm">
              Logout
            </button>
          </div>
        </div>

        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 text-center">
          <span className="text-6xl mb-4 block">🚪</span>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Halaman Terminal Keberangkatan</h2>
          <p className="text-gray-600 mb-6">Di sini nanti tempat untuk Scan QR Boarding dan Jual Tiket Darurat.</p>
          <button
            onClick={() => router.push('/scan')}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-700 shadow-md"
          >
            Buka Scanner
          </button>
        </div>
      </div>
    </div>
  )
}