// app/robots.ts
// Selama aplikasi masih diuji di tiket-kapal.vercel.app, seluruh situs ditutup
// dari mesin pencari supaya alamat sementara itu tidak terindeks sebagai
// "produk utama" (dan tidak bentrok dengan domain resmi nanti).
//
// Setelah www.lintasair.com aktif:
//   NEXT_PUBLIC_SITE_URL=https://www.lintasair.com
//   NEXT_PUBLIC_INDEXABLE=true
// lalu REDEPLOY (env Vercel hanya terbaca saat build).
import type { MetadataRoute } from 'next'

const SITUS = (process.env.NEXT_PUBLIC_SITE_URL || 'https://tiket-kapal.vercel.app')
  .trim()
  .replace(/\/+$/, '')

// Hanya halaman pembeli yang layak muncul di hasil pencarian.
const HALAMAN_PUBLIK = ['/', '/cek-tiket', '/syahbandar']

// Halaman staf, superadmin, dan API tidak boleh diindeks.
const HALAMAN_PRIVAT = [
  '/api',
  '/backup-data',
  '/cari-tiket',
  '/cetak-ulang',
  '/daftar-penumpang',
  '/dashboard',
  '/dashboard-superadmin',
  '/etiket',
  '/ganti-password',
  '/kapal',
  '/laporan',
  '/login',
  '/pengaturan',
  '/pilih-mode',
  '/pusat-laporan-keberangkatan',
  '/rekap-bagi-hasil',
  '/scan',
  '/superadmin',
  '/template-jadwal'
]

export default function robots(): MetadataRoute.Robots {
  if (process.env.NEXT_PUBLIC_INDEXABLE !== 'true') {
    return {
      rules: [{ userAgent: '*', disallow: '/' }]
    }
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: HALAMAN_PUBLIK,
        disallow: HALAMAN_PRIVAT
      }
    ],
    host: SITUS
  }
}
