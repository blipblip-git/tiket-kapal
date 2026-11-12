'use client'

import { useRouter } from 'next/navigation'

export default function PusatKontrolOnlinePage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gray-900 p-6 text-white">
      <div className="max-w-4xl mx-auto">
        
        <button 
          onClick={() => router.back()} 
          className="text-sm bg-gray-800 px-4 py-2 rounded hover:bg-gray-700 mb-6 border border-gray-700"
        >
          &larr; Kembali
        </button>

        <div className="bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-700">
          <h1 className="text-2xl font-bold mb-2">Pusat Kendali Lintasea</h1>
          <p className="text-gray-400 mb-6">Area untuk mengatur tampilan halaman pembeli online (Beranda, Pilih Jadwal, Kursi, dll).</p>
          
          <div className="bg-gray-900 p-6 rounded border border-gray-700 text-center text-gray-500">
            Fitur Edit Teks & Ikon akan diimplementasikan di sini.
          </div>
        </div>

      </div>
    </div>
  )
}