'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase, getProfile } from '@/lib/supabase'

// Halaman pemilih: "Manajemen Petugas" punya 2 jenis akun.
// - Petugas Keberangkatan: scan boarding & manifest (menu lama).
// - Petugas Kolektor: penagih cash dari agen/petugas di lokasi yang sama.
//
// Halaman ini MILIK ADMIN UTAMA PENYEWA (akun petugas = akun tenant).
// Superadmin TIDAK mengelola akun petugas; tulisan halaman ini hanya diatur
// di Pusat Kontrol > Teks: Akun Petugas (khusus tampilan).
export default function ManajemenPetugasPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [aksesDitolak, setAksesDitolak] = useState(false)

  const [teks, setTeks] = useState({
    judul_akun_petugas: 'Manajemen Petugas',
    ket_akun_petugas: 'Pilih jenis akun petugas yang ingin dikelola. (Halaman ini untuk akun login, bukan revisi tulisan.)',
    menu_akun_keberangkatan: 'Manajemen Petugas',
    ket_akun_keberangkatan: 'Akun petugas keberangkatan (scan boarding & manifest) per lokasi.',
    menu_akun_kolektor: 'Manajemen Petugas Kolektor',
    ket_akun_kolektor: 'Akun penagih uang cash dari agen & petugas di lokasi yang sama (Tarakan, Tanjung Selor, KTT, dst).',
  })

  useEffect(() => {
    async function siapkan() {
      // Role dicek lewat getProfile() supaya tetap jalan untuk Admin Utama
      // yang login pakai sesi operator (HP), bukan hanya akun auth email.
      const profil = await getProfile()
      const role = (profil?.role || '').trim().toLowerCase()
      if (role !== 'admin_utama') {
        setAksesDitolak(true)
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('pengaturan_teks')
        .select('data_teks')
        .eq('role', 'petugas')
        .maybeSingle()

      if (data?.data_teks) {
        setTeks((lama) => ({ ...lama, ...(data.data_teks as Record<string, string>) }))
      }
      setLoading(false)
    }
    siapkan()
  }, [])

  function buka(path: string) {
    router.push(path)
  }

  // Tujuan kembali tetap, BUKAN history browser
  // (dulu pakai router.back() sehingga bisa muter-muter di halaman ini).
  function kembali() {
    router.push('/dashboard')
  }

  if (loading) return <p className="p-8 text-center text-gray-500">Memuat...</p>

  if (aksesDitolak) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-800 mb-2">Akses ditolak</h1>
          <p className="text-sm text-gray-600 mb-4">Halaman ini hanya untuk Admin Utama penyewa. Akun petugas dikelola oleh admin masing-masing penyewa.</p>
          <button onClick={() => router.push('/dashboard')} className="text-sm text-blue-600 hover:underline">&larr; Kembali</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">

        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              {teks.judul_akun_petugas}
            </h1>
            <p className="text-sm text-gray-500 mt-1">{teks.ket_akun_petugas}</p>
          </div>
          <button onClick={kembali} className="text-sm text-blue-600 hover:underline px-2 flex-shrink-0">
            ← Kembali
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => buka('/superadmin/pusat-kontrol/admin/petugas/keberangkatan')}
            className="text-left bg-white border border-blue-200 rounded-xl shadow-sm p-5 hover:border-blue-400 hover:bg-blue-50 transition flex flex-col gap-2"
          >
            <span className="text-3xl">🧑‍✈️</span>
            <span className="text-lg font-bold text-blue-900">{teks.menu_akun_keberangkatan}</span>
            <span className="text-sm text-gray-600">{teks.ket_akun_keberangkatan}</span>
            <span className="text-xs font-bold text-blue-700 mt-1">Buka &rsaquo;</span>
          </button>

          <button
            onClick={() => buka('/superadmin/pusat-kontrol/admin/petugas/kolektor')}
            className="text-left bg-white border border-emerald-200 rounded-xl shadow-sm p-5 hover:border-emerald-400 hover:bg-emerald-50 transition flex flex-col gap-2"
          >
            <span className="text-3xl">💰</span>
            <span className="text-lg font-bold text-emerald-900">{teks.menu_akun_kolektor}</span>
            <span className="text-sm text-gray-600">{teks.ket_akun_kolektor}</span>
            <span className="text-xs font-bold text-emerald-700 mt-1">Buka &rsaquo;</span>
          </button>
        </div>

      </div>
    </div>
  )
}
