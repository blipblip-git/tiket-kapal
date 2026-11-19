'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Halaman pemilih: "Manajemen Petugas" sekarang punya 2 jenis akun.
// - Petugas Keberangkatan: scan boarding & manifest (menu lama).
// - Petugas Kolektor: penagih cash dari agen/petugas di lokasi yang sama.
//
// Catatan: halaman ini untuk KELOLA AKUN. Untuk mengubah tulisan/tampilannya,
// Superadmin memakai Pusat Kontrol > Teks: Petugas.
export default function ManajemenPetugasPage() {
  const router = useRouter()
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  const [loading, setLoading] = useState(true)

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
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: p } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()
        setIsSuperadmin(p?.role === 'superadmin')
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
    // Teruskan ?operator=... supaya mode "tes sebagai penyewa" di Pusat Kontrol tetap jalan.
    const suffix = typeof window !== 'undefined' ? window.location.search : ''
    router.push(path + suffix)
  }

  // Tujuan kembali ditentukan dari role, BUKAN history browser
  // (dulu pakai router.back() sehingga bisa muter-muter di halaman ini).
  function kembali() {
    if (isSuperadmin) {
      router.push('/superadmin/pusat-kontrol')
      return
    }
    router.push('/dashboard')
  }

  if (loading) return <p className="p-8 text-center text-gray-500">Memuat...</p>

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">

        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2 flex-wrap">
              {teks.judul_akun_petugas}
              {isSuperadmin && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full flex items-center gap-1 border border-green-300">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span> Mode Pusat Kontrol
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-500 mt-1">{teks.ket_akun_petugas}</p>
            {isSuperadmin && (
              <button
                onClick={() => router.push('/superadmin/pusat-kontrol/petugas')}
                className="text-xs text-blue-600 hover:underline mt-2 font-bold"
              >
                ✏️ Ubah tulisan halaman ini (Pusat Kontrol &rsaquo; Teks: Petugas)
              </button>
            )}
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
