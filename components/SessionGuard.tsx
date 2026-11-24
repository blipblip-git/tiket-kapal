'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  bolehModePratinjau,
  cekValidasiSesi,
  cekAutoLogout,
  cekStatusOperator,
  getOperatorSession,
  logoutOperator,
  supabase,
} from '@/lib/supabase'

export default function SessionGuard() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    // 1. CEK MODE PREVIEW DARI SUPERADMIN
    // ?preview=true BUKAN tiket masuk gratis: harus ada sesi Supabase Auth
    // milik Superadmin/Admin Utama (lihat bolehModePratinjau). Sebelumnya cek
    // ini hanya `return`, sehingga siapa pun bisa membuka halaman staf tanpa
    // login cukup dengan menambahkan ?preview=true di URL.
    const isPreview = searchParams.get('preview') === 'true'
    if (isPreview) {
      bolehModePratinjau().then((boleh) => {
        if (!boleh) {
          console.log('Mode pratinjau ditolak: bukan sesi Superadmin.')
          router.replace('/superadmin')
        }
      })
      return
    }

    // 2. Hanya halaman staf/admin yang perlu dicek login.
    // PENTING: jangan memakai daftar halaman publik dengan startsWith('/') — '/'
    // cocok dengan SEMUA path, sehingga guard ini tidak pernah berjalan (bug lama).
    const awalanWajibLogin = [
      '/dashboard', // termasuk /dashboard-superadmin/...
      '/agen', // termasuk /agen-tenant
      '/audit',
      '/backup-data',
      '/cetak-ulang',
      '/ganti-password',
      '/kapal',
      '/laporan',
      '/pengaturan',
      '/pilih-mode',
      '/pusat-laporan-keberangkatan',
      '/rekap-bagi-hasil',
      '/scan',
      '/template-jadwal',
      '/superadmin/pusat-kontrol',
    ]

    const wajibLogin = awalanWajibLogin.some((awalan) => pathname.startsWith(awalan))
    if (!wajibLogin) {
      return
    }

    // 3. CEK SESI LOKAL (PETUGAS/AGEN) DULU: single session + auto-logout jam kerja
    const sesiLokal = getOperatorSession()
    if (sesiLokal) {
      // Sesi lokal (localStorage) saja TIDAK cukup sejak security-tahap2.sql.
      // Tanpa token Supabase Auth, semua query jalan sebagai anon: halaman admin
      // tampil kosong / "permission denied for table profiles". Jadi kalau token
      // Auth sudah hilang atau kedaluwarsa, paksa login ulang.
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) {
          console.log('Sesi Supabase Auth tidak ada, memaksa login ulang...')
          logoutOperator('session_expired')
          return
        }

        cekAutoLogout(sesiLokal).then((harusLogout) => {
          if (harusLogout) {
            console.log('Jam kerja selesai, auto-logout petugas...')
            logoutOperator('jam_kerja_selesai')
          }
        })

        // 3b. Akun/perusahaan dinonaktifkan atau dihapus Superadmin -> tendang.
        cekStatusOperator(sesiLokal).then((masihAktif) => {
          if (!masihAktif) {
            console.log('Akun atau perusahaan dinonaktifkan, mengalihkan ke login...')
            logoutOperator()
          }
        })
      })
      return
    }

    // 4. CEK SESSION SUPABASE (UNTUK SUPERADMIN)
    // Kalau ada sesi Supabase Auth yang valid, berarti dia Superadmin/Admin Utama. Biarkan lewat.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) return

      // 5. JIKA DUA-DUANYA KOSONG, BARU CEK VALIDASI & TENDANG KE LOGIN
      cekValidasiSesi().then((isValid) => {
        if (!isValid) {
          console.log('Sesi tidak valid, mengalihkan ke login...')
          // Superadmin punya halaman login sendiri di /superadmin.
          router.push(pathname.startsWith('/superadmin') ? '/superadmin' : '/login')
        }
      })
    })

  }, [pathname, router, searchParams])

  return null
}