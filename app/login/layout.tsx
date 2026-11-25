// app/login/layout.tsx
// Judul khusus halaman masuk petugas/agen & syahbandar.
//
// Kenapa perlu layout terpisah: app/login/page.tsx adalah komponen klien
// ('use client') sehingga tidak boleh mengekspor `metadata`. Safari iOS juga
// mengambil label ikon "Tambahkan ke layar utama" dari appleWebApp.title —
// tanpa berkas ini, ikon di iPhone tetap tertulis "LintasAir", bukan "Login".

import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Login Petugas/Agen dan Syahbandar',
  description: 'Halaman masuk petugas, agen, dan syahbandar.',
  // Label ikon di HP (Android memakai short_name manifest, iOS memakai ini).
  appleWebApp: {
    capable: true,
    title: 'Login',
    statusBarStyle: 'default',
  },
}

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children
}
