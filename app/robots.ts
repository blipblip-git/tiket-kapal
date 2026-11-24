// app/robots.ts
// Domain resmi sekarang www.lintasair.com. Mesin pencari hanya boleh masuk
// kalau NEXT_PUBLIC_INDEXABLE='true'; kalau tidak, seluruh situs ditutup.
//
// Catatan: fallback di bawah SENGAJA memakai domain produksi (bukan
// tiket-kapal.vercel.app) supaya direktif Host/Sitemap tidak pernah menunjuk
// alamat sementara kalau env Vercel lupa diset. Samakan dengan app/layout.tsx.
//
// Env Vercel yang benar:
//   NEXT_PUBLIC_SITE_URL=https://www.lintasair.com
//   NEXT_PUBLIC_INDEXABLE=true
// lalu REDEPLOY (env Vercel hanya terbaca saat build).
import type { MetadataRoute } from 'next'

const SITUS = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.lintasair.com')
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
    sitemap: `${SITUS}/sitemap.xml`,
    host: SITUS
  }
}
