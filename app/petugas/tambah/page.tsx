// app/petugas/tambah/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getProfile, type Profile } from '@/lib/supabase'

export default function TambahPetugasPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  
  const [nama, setNama] = useState('')
  const [noHp, setNoHp] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [pesan, setPesan] = useState<{ tipe: 'ok' | 'err'; teks: string } | null>(null)

  useEffect(() => {
    async function init() {
      const p = await getProfile()
      if (!p || p.role !== 'admin_utama') {
        router.push('/login')
        return
      }
      setProfile(p)
    }
    init()
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPesan(null)
    
    if (!nama || !noHp || !password) {
      setPesan({ tipe: 'err', teks: 'Semua kolom wajib diisi bray.' })
      return
    }

    setLoading(true)

    const { data, error } = await supabase.rpc('buat_akun_petugas', {
      p_nama: nama,
      p_nomor_hp: noHp,
      p_password: password,
    })

    setLoading(false)

    if (error) {
      setPesan({ tipe: 'err', teks: 'Gagal: ' + error.message })
      return
    }

    const res = data as { success: boolean; message?: string; email?: string }
    if (!res.success) {
      setPesan({ tipe: 'err', teks: 'Gagal: ' + (res.message || 'Unknown error') })
      return
    }

    // Berhasil
    setPesan({ tipe: 'ok', teks: 'Petugas berhasil ditambahkan! Mengalihkan ke halaman manajemen...' })
    
    setTimeout(() => {
      router.push('/petugas')
    }, 2000)
  }

  if (!profile) return <p className="p-6 text-center text-gray-600">Memuat...</p>

  return (
    <div className="min-h-screen bg-gray-100 p-6 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Tambah Petugas</h1>
          <p className="text-sm text-gray-500 mt-1">Buat akun baru untuk petugas lapangan</p>
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

        <form onSubmit={handleSubmit}>
          <label className="block mb-1 text-sm font-medium text-gray-700">Nama Lengkap</label>
          <input
            type="text"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            className="w-full border rounded px-3 py-2 mb-4 text-gray-900"
            placeholder="Contoh: Budi Santoso"
            required
          />

          <label className="block mb-1 text-sm font-medium text-gray-700">Nomor HP</label>
          <input
            type="tel"
            value={noHp}
            onChange={(e) => setNoHp(e.target.value)}
            className="w-full border rounded px-3 py-2 mb-4 text-gray-900"
            placeholder="Contoh: 082338313098"
            required
          />

          <label className="block mb-1 text-sm font-medium text-gray-700">Password</label>
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded px-3 py-2 mb-6 text-gray-900"
            placeholder="Password untuk login petugas"
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded hover:bg-blue-700 disabled:bg-gray-400 font-medium"
          >
            {loading ? 'Menyimpan...' : '+ Simpan Petugas'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => router.push('/petugas')}
            className="text-sm text-blue-600 hover:underline"
          >
            ← Kembali ke Manajemen Petugas
          </button>
        </div>
      </div>
    </div>
  )
}