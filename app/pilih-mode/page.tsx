'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getOperatorSession } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'

export default function PilihModePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const sesi = getOperatorSession()
    if (!sesi) {
      router.push('/login')
      return
    }
    if (sesi.role === 'admin_utama') {
      router.push('/dashboard')
      return
    }

    // ==================== KUNCI AKSES BERDASARKAN ROLE ====================
    if (sesi.role === 'petugas_loket') {
      localStorage.setItem('mode_kerja', 'loket')
      router.replace('/dashboard/loket')
      return
    }

    if (sesi.role === 'petugas_mobile') {
      localStorage.setItem('mode_kerja', 'mobile')
      router.replace('/dashboard/loket') // Loket dan mobile pakai UI yang sama
      return
    }

    if (sesi.role === 'terminal_keberangkatan') {
      localStorage.setItem('mode_kerja', 'terminal')
      // PERBAIKAN: Arahkan ke dashboard keberangkatan, bukan langsung ke scan
      router.replace('/dashboard/keberangkatan')
      return
    }

    // Kalau role tidak dikenali
    setProfile(sesi)
    setLoading(false)
  }, [router])

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat...</p>

  // Fallback jika tidak ter-redirect
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <div className="bg-white p-8 rounded shadow text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Akses Ditolak</h1>
        <p className="text-gray-600">Role Anda tidak dikenali oleh sistem.</p>
        <button onClick={() => router.push('/login')} className="mt-4 text-blue-600 hover:underline">
          Kembali ke Login
        </button>
      </div>
    </div>
  )
}