'use client'

import Link from 'next/link'

// Pendaftaran mandiri DITUTUP (celah keamanan): akun hanya boleh dibuat oleh
// pemilik platform / Superadmin.
export default function RegistrasiAdminPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white rounded shadow-md p-6 max-w-md w-full text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-3">Pendaftaran Ditutup</h1>
        <p className="text-sm text-gray-700 mb-4">
          Pendaftaran akun penyewa dilakukan oleh pemilik platform. Hubungi admin
          untuk dibuatkan akun, lalu login seperti biasa.
        </p>
        <Link href="/login" className="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 font-medium">
          Ke Halaman Login
        </Link>
      </div>
    </div>
  )
}
