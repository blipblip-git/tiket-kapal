'use client'

import Link from 'next/link'

// Pendaftaran Superadmin mandiri DITUTUP. Akun Superadmin hanya dibuat manual
// oleh pemilik platform di Supabase / menu internal.
export default function DaftarSuperAdminPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white rounded shadow-md p-6 max-w-md w-full text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-3">Pendaftaran Superadmin Ditutup</h1>
        <p className="text-sm text-gray-700 mb-4">
          Akun Superadmin hanya dibuat oleh pemilik platform. Silakan login dengan
          akun yang sudah terdaftar.
        </p>
        <Link href="/superadmin" className="inline-block bg-blue-800 text-white px-4 py-2 rounded hover:bg-blue-900 font-medium">
          Ke Login Superadmin
        </Link>
      </div>
    </div>
  )
}
