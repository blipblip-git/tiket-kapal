'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cekValidasiSesi, supabase } from '@/lib/supabase'

export default function SessionGuard() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    // 1. CEK MODE PREVIEW DARI SUPERADMIN
    // Jika ada ?preview=true, jangan lakukan pengecekan sesi apapun.
    const isPreview = searchParams.get('preview') === 'true'
    if (isPreview) {
      return
    }

    // 2. Halaman publik yang tidak perlu dicek login
    const halamanPublik = [
      '/', 
      '/login', 
      '/cek-tiket', 
      '/etiket', 
      '/form', 
      '/superadmin', // Halaman login superadmin
      '/syahbandar', 
      '/kursi', 
      '/pembayaran'
    ]
    
    if (halamanPublik.some(path => pathname === path || pathname.startsWith(path))) {
      return
    }

    // 3. CEK SESSION SUPABASE (UNTUK SUPERADMIN)
    // Kalau ada sesi Supabase Auth yang valid, berarti dia Superadmin/Admin Utama. Biarkan lewat.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) return

      // 4. JIKA TIDAK ADA SESI SUPABASE, CEK SESSION LOKAL (PETUGAS/AGEN)
      const sesiLokal = typeof window !== 'undefined' ? localStorage.getItem('petugas_session') : null

      if (sesiLokal) {
        return
      }

      // 5. JIKA DUA-DUANYA KOSONG, BARU CEK VALIDASI & TENDANG KE LOGIN
      cekValidasiSesi().then((isValid) => {
        if (!isValid) {
          console.log('Sesi tidak valid, mengalihkan ke login...')
          router.push('/login')
        }
      })
    })

  }, [pathname, router, searchParams])

  return null
}