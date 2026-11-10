'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cekValidasiSesi } from '@/lib/supabase'

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
      '/superadmin', 
      '/syahbandar', 
      '/kursi', 
      '/pembayaran'
    ]
    
    if (halamanPublik.some(path => pathname === path || pathname.startsWith(path))) {
      return
    }

    // 3. Cek apakah ada sesi yang tersimpan di localStorage
    const sesi = typeof window !== 'undefined' ? localStorage.getItem('petugas_session') : null

    if (sesi) {
      return
    }

    cekValidasiSesi().then((isValid) => {
      if (!isValid) {
        console.log('Sesi tidak valid, mengalihkan ke login...')
        router.push('/login')
      }
    })

  }, [pathname, router, searchParams])

  return null
}