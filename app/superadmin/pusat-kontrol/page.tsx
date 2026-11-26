'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase, type Profile } from '@/lib/supabase'

// Pusat Kontrol = "mother file" untuk SEMUA kamar penyewa (khusus Superadmin).
// Semua kartu di sini hanya mengubah tulisan/tampilan atau data global.
// TIDAK ada pengelolaan akun petugas di sini: akun petugas adalah milik
// penyewa dan dibuat Admin Utama masing-masing. Satu-satunya kartu akun
// adalah Syahbandar (akun platform, lintas penyewa).
type Kartu = {
  path: string
  ikon: string
  judul: string
  ket: string
  jenis: 'teks' | 'akun'
}

const KARTU: Kartu[] = [
  {
    path: '/superadmin/pusat-kontrol/kota',
    ikon: '📍',
    judul: 'Master Rute (Daerah)',
    ket: 'Daftar daerah tujuan untuk semua penyewa + singkatan cetak.',
    jenis: 'teks',
  },
  {
    path: '/superadmin/pusat-kontrol/admin',
    ikon: '👨‍💼',
    judul: 'Teks: Admin Utama',
    ket: 'Atur judul, tombol, dan nama menu di dashboard Admin Utama.',
    jenis: 'teks',
  },
  {
    path: '/superadmin/pusat-kontrol/petugas',
    ikon: '📷',
    judul: 'Teks: Petugas',
    ket: 'Judul dashboard dan nama menu untuk semua Petugas Keberangkatan.',
    jenis: 'teks',
  },
  {
    path: '/superadmin/pusat-kontrol/agen',
    ikon: '🤝',
    judul: 'Teks: Agen',
    ket: 'Atur judul, ikon, dan nama menu dashboard Agen.',
    jenis: 'teks',
  },
  {
    path: '/superadmin/pusat-kontrol/petugas/akun',
    ikon: '📝',
    judul: 'Teks: Akun Petugas',
    ket: 'Tulisan halaman Akun Petugas (judul, keterangan, 2 kartu). Hanya teks, bukan pembuatan akun.',
    jenis: 'teks',
  },
  {
    path: '/superadmin/pusat-kontrol/admin/syahbandar',
    ikon: '⚓',
    judul: 'Akun Syahbandar',
    ket: 'Akun login manifest syahbandar. Satu akun berlaku untuk semua daerah.',
    jenis: 'akun',
  },
]

export default function PusatKontrolPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function cekSesi() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/superadmin')
        return
      }

      const { data: p } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (!p || p.role !== 'superadmin') {
        setError('Halaman ini khusus Superadmin.')
        setLoading(false)
        return
      }

      setProfile(p as Profile)
      setLoading(false)
    }
    cekSesi()
  }, [router])

  if (loading) return <p className="p-6 text-center text-gray-400 bg-gray-900 min-h-screen flex items-center justify-center">Memuat...</p>
  if (error) return <p className="p-6 text-center text-red-500 bg-gray-900 min-h-screen flex items-center justify-center">{error}</p>
  if (!profile) return null

  return (
    <div className="min-h-screen bg-gray-900 p-6 flex flex-col items-center justify-center">
      <div className="w-full max-w-5xl">

        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Pusat Kontrol Website</h1>
            <p className="text-sm text-gray-400">Mother File: atur teks & akun untuk semua kamar penyewa.</p>
          </div>
          <button onClick={() => router.push('/dashboard-superadmin')} className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600 text-sm font-medium">
            &larr; Kembali
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">

          {KARTU.map((k) => (
            <button
              key={k.path}
              onClick={() => router.push(k.path)}
              className="bg-gray-800 border border-gray-700 p-6 rounded-xl hover:bg-gray-750 transition text-left flex flex-col items-start h-40 justify-center shadow-lg group"
            >
              <div className="text-4xl mb-3 group-hover:scale-110 transition">{k.ikon}</div>
              <h2 className="text-lg font-bold text-white mb-1">{k.judul}</h2>
              <p className="text-xs text-gray-400">{k.ket}</p>
              <span className={`mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full border ${k.jenis === 'teks' ? 'bg-blue-900/60 text-blue-200 border-blue-700' : 'bg-emerald-900/60 text-emerald-200 border-emerald-700'}`}>
                {k.jenis === 'teks' ? 'Editor Teks' : 'Kelola Akun'}
              </span>
            </button>
          ))}

        </div>

        <p className="text-xs text-gray-500 mt-6">
          Catatan: kartu <b>Editor Teks</b> hanya mengubah tulisan. Kartu <b>Kelola Akun</b> hanya untuk akun <b>Syahbandar</b> (akun platform). Akun petugas dibuat oleh Admin Utama masing-masing penyewa.
        </p>
      </div>
    </div>
  )
}
