'use client'

import { useRouter } from 'next/navigation'

// Halaman pemilih: "Manajemen Petugas" sekarang punya 2 jenis akun.
// - Petugas Keberangkatan: scan boarding & manifest (menu lama).
// - Petugas Kolektor: penagih cash dari agen/petugas di lokasi yang sama.
export default function ManajemenPetugasPage() {
  const router = useRouter()

  function buka(path: string) {
    // Teruskan ?operator=... supaya mode "tes sebagai penyewa" di Pusat Kontrol tetap jalan.
    const suffix = typeof window !== 'undefined' ? window.location.search : ''
    router.push(path + suffix)
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              Manajemen Petugas
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full flex items-center gap-1 border border-green-300">
                <span className="w-2 h-2 rounded-full bg-green-500"></span> Mode Pusat Kontrol
              </span>
            </h1>
            <p className="text-sm text-gray-500 mt-1">Pilih jenis akun petugas yang ingin dikelola.</p>
          </div>
          <button onClick={() => router.push('/dashboard')} className="text-sm text-blue-600 hover:underline px-2">
            ← Kembali
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => buka('/superadmin/pusat-kontrol/admin/petugas/keberangkatan')}
            className="text-left bg-white border border-blue-200 rounded-xl shadow-sm p-5 hover:border-blue-400 hover:bg-blue-50 transition flex flex-col gap-2"
          >
            <span className="text-3xl">🧑‍✈️</span>
            <span className="text-lg font-bold text-blue-900">Manajemen Petugas</span>
            <span className="text-sm text-gray-600">
              Akun petugas keberangkatan (scan boarding &amp; manifest) per lokasi.
            </span>
            <span className="text-xs font-bold text-blue-700 mt-1">Buka &rsaquo;</span>
          </button>

          <button
            onClick={() => buka('/superadmin/pusat-kontrol/admin/petugas/kolektor')}
            className="text-left bg-white border border-emerald-200 rounded-xl shadow-sm p-5 hover:border-emerald-400 hover:bg-emerald-50 transition flex flex-col gap-2"
          >
            <span className="text-3xl">💰</span>
            <span className="text-lg font-bold text-emerald-900">Manajemen Petugas Kolektor</span>
            <span className="text-sm text-gray-600">
              Akun penagih uang cash dari agen &amp; petugas di lokasi yang sama (Tarakan, Tanjung Selor, KTT, dst).
            </span>
            <span className="text-xs font-bold text-emerald-700 mt-1">Buka &rsaquo;</span>
          </button>
        </div>

      </div>
    </div>
  )
}
