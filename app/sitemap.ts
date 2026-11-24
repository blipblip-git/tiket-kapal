// app/sitemap.ts
// Peta situs untuk mesin pencari. Isinya HANYA halaman yang memang dibuka
// untuk umum — harus sama dengan daftar `allow` di app/robots.ts, supaya
// sitemap tidak pernah menawarkan halaman yang justru dilarang diindeks.
import type { MetadataRoute } from 'next'

const SITUS = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.lintasair.com')
  .trim()
  .replace(/\/+$/, '')

const HALAMAN: Array<{
  path: string
  priority: number
  changeFrequency: 'daily' | 'weekly' | 'monthly'
}> = [
  // Beranda pembeli: jadwal berubah tiap hari, jadi paling sering berubah.
  { path: '/', priority: 1, changeFrequency: 'daily' },
  { path: '/cek-tiket', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/syahbandar', priority: 0.6, changeFrequency: 'weekly' }
]

export default function sitemap(): MetadataRoute.Sitemap {
  // Mode uji (INDEXABLE bukan 'true'): sitemap sengaja kosong, sejalan dengan
  // robots.txt yang menutup seluruh situs dari mesin pencari.
  if (process.env.NEXT_PUBLIC_INDEXABLE !== 'true') return []

  return HALAMAN.map((h) => ({
    url: `${SITUS}${h.path}`,
    changeFrequency: h.changeFrequency,
    priority: h.priority
  }))
}
