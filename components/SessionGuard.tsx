'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { cekValidasiSesi } from '@/lib/supabase'

export default function SessionGuard() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    // Halaman publik yang tidak perlu dicek login
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
    
    // Jika sedang di halaman publik, lewati pengecekan
    if (halamanPublik.some(path => pathname === path || pathname.startsWith(path))) {
      return
    }

    // Cek apakah ada sesi yang tersimpan di localStorage
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

  }, [pathname, router])

  return null
}