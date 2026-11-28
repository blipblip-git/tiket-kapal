import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Next.js 16: file `middleware.ts` sudah diganti menjadi `proxy.ts`.
// Di deployment DEMO, seluruh area Superadmin disembunyikan. Demo tetap memakai
// kode yang sama dengan REAL, tetapi tidak punya Superadmin/Pusat Kontrol/Data
// Penyewa. API Superadmin juga ditutup supaya tidak ada jalan masuk lewat API.
const MODE_DEMO =
  process.env.DEMO_MODE === 'true' || process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

// DEMO_SUPERADMIN=true = pintu Superadmin dibuka KHUSUS di demo. Dipakai pemilik
// demo saat harus membuat beberapa akun penyewa (mis. 5 pemilik kapal yang mau
// mencoba) tanpa lewat SQL. Di REAL variabel ini tidak berguna karena REAL
// memang tidak pernah diblokir. Tanpa variabel ini, demo kembali 404 seperti
// biasa (default aman kalau project demo baru disiapkan).
const DEMO_SUPERADMIN = process.env.DEMO_SUPERADMIN === 'true'

// Halaman yang secara FOLDER ada di dalam /superadmin, tetapi sebenarnya dipakai
// PENYEWA (Admin Utama/Agen/Petugas), bukan Superadmin. Ini tetap dibuka di demo
// supaya alur inti bisa diuji:
//   - admin/petugas  = menu "Manajemen Petugas" di dashboard Admin Utama
//   - etiket         = halaman cetak e-tiket; semua staf yang membuka /etiket
//                      ditendang ke sini (lihat app/etiket/page.tsx)
// Halaman superadmin lain (Pusat Kontrol, Data Penyewa, Kota, Online, Agen,
// Manifest, Akun Petugas, dsb) tetap 404 di demo.
const HALAMAN_TENANT = [
  '/superadmin/pusat-kontrol/admin/petugas',
  '/superadmin/pusat-kontrol/etiket'
]

function halamanTenant(pathname: string): boolean {
  return HALAMAN_TENANT.some(
    (awal) => pathname === awal || pathname.startsWith(awal + '/')
  )
}

function areaSuperadmin(pathname: string): boolean {
  if (halamanTenant(pathname)) return false

  return (
    pathname === '/superadmin' ||
    pathname.startsWith('/superadmin/') ||
    pathname === '/dashboard-superadmin' ||
    pathname.startsWith('/dashboard-superadmin/') ||
    pathname === '/api/superadmin' ||
    pathname.startsWith('/api/superadmin/')
  )
}

export function proxy(request: NextRequest) {
  if (!MODE_DEMO || DEMO_SUPERADMIN) return NextResponse.next()

  if (areaSuperadmin(request.nextUrl.pathname)) {
    return new NextResponse('Halaman ini tidak tersedia di lingkungan demo.', {
      status: 404,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store'
      }
    })
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/superadmin',
    '/superadmin/:path*',
    '/dashboard-superadmin',
    '/dashboard-superadmin/:path*',
    '/api/superadmin',
    '/api/superadmin/:path*'
  ]
}
