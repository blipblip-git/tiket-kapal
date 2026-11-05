// app/pengaturan/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, ambilPengaturan, type Profile, type PengaturanSistem } from '@/lib/supabase'

export default function PengaturanPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pesan, setPesan] = useState<{ tipe: 'ok' | 'err'; teks: string } | null>(null)

  const [jamMulai, setJamMulai] = useState('06:00')
  const [jamSelesai, setJamSelesai] = useState('17:00')
  const [autoLogoutAktif, setAutoLogoutAktif] = useState(true)

  useEffect(() => {
    async function init() {
      const p = await getProfile()
      if (!p || p.role !== 'admin_utama') {
        router.push('/login')
        return
      }
      setProfile(p)

      const setting = await ambilPengaturan()
      if (setting) {
        setJamMulai(setting.jam_mulai_kerja.slice(0, 5)) // Ambil HH:MM saja
        setJamSelesai(setting.jam_selesai_kerja.slice(0, 5))
        setAutoLogoutAktif(setting.auto_logout_aktif)
      }
      setLoading(false)
    }
    init()
  }, [router])

  async function handleSimpan(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    setPesan(null)

    // Ambil ID pengaturan
    const { data: setting } = await supabase.from('pengaturan_sistem').select('id').limit(1).single()
    
    if (!setting) {
      setPesan({ tipe: 'err', teks: 'Data pengaturan tidak ditemukan.' })
      setSaving(false)
      return
    }

    const { error } = await supabase
      .from('pengaturan_sistem')
      .update({
        jam_mulai_kerja: jamMulai,
        jam_selesai_kerja: jamSelesai,
        auto_logout_aktif: autoLogoutAktif,
        updated_at: new Date().toISOString(),
        updated_by: profile.email,
      })
      .eq('id', setting.id)

    setSaving(false)

    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal menyimpan: ' + error.message })
      return
    }

    setPesan({ tipe: 'ok', teks: 'Pengaturan berhasil disimpan. Berlaku untuk semua petugas.' })
  }

  if (loading) return <p className="p-6 text-center text-gray-600">Memuat pengaturan...</p>

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pengaturan Sistem</h1>
            <p className="text-sm text-gray-700">Atur jam kerja dan auto-logout petugas</p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-sm text-blue-600 hover:underline"
          >
            ← Kembali ke Dashboard
          </button>
        </div>

        {pesan && (
          <div
            className={`mb-4 px-4 py-3 rounded-lg text-sm ${
              pesan.tipe === 'ok'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {pesan.teks}
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6">
          <form onSubmit={handleSimpan}>
            
            <div className="mb-6">
              <h3 className="text-lg font-bold text-gray-900 mb-3 border-b pb-2">Jam Kerja Petugas</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Jam Mulai Kerja</label>
                  <input
                    type="time"
                    value={jamMulai}
                    onChange={(e) => setJamMulai(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Jam Selesai Kerja</label>
                  <input
                    type="time"
                    value={jamSelesai}
                    onChange={(e) => setJamSelesai(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-gray-900"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Jika petugas login melewati jam selesai, sistem akan otomatis mengeluarkan mereka (logout).
              </p>
            </div>

            <div className="mb-6">
              <h3 className="text-lg font-bold text-gray-900 mb-3 border-b pb-2">Fitur Auto-Logout</h3>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoLogoutAktif}
                  onChange={(e) => setAutoLogoutAktif(e.target.checked)}
                  className="w-5 h-5 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-800 font-medium">
                  Aktifkan auto-logout untuk semua petugas lapangan
                </span>
              </label>
              <p className="text-xs text-gray-500 mt-2 ml-8">
                Admin Utama tidak akan terkena auto-logout.
              </p>
            </div>

            <div className="border-t pt-4 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 font-medium"
              >
                {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}