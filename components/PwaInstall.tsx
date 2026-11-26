'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

// beforeinstallprompt belum ada di tipe standar TypeScript, jadi dideskripsikan manual.
type EventInstal = Event & {
  prompt: () => Promise<void>
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Tombol pemasangan hanya ditawarkan di halaman publik. Halaman staf/admin
// sengaja dilewati supaya tidak menutupi tombol aksi saat kerja.
const HALAMAN_TAWAR_PASANG = ['/', '/cari-tiket', '/cek-tiket', '/etiket', '/login', '/pembayaran']

export default function PwaInstall() {
  const pathname = usePathname()
  const [tawaran, setTawaran] = useState<EventInstal | null>(null)
  const [sudahTerpasang, setSudahTerpasang] = useState(true)
  const [ditolak, setDitolak] = useState(true)
  const bannerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Daftarkan service worker: ini yang membuat aplikasi bisa dipasang dan
    // dibuka tanpa address bar seperti aplikasi asli.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Gagal daftar SW tidak boleh mengganggu pemesanan tiket.
      })
    }

    const modeAplikasi =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true

    setSudahTerpasang(modeAplikasi)
    setDitolak(window.localStorage.getItem('lintasair-install-ditolak') === '1')

    const tangkapTawaran = (e: Event) => {
      e.preventDefault()
      setTawaran(e as EventInstal)
    }
    const tandaiTerpasang = () => {
      setSudahTerpasang(true)
      setTawaran(null)
    }

    window.addEventListener('beforeinstallprompt', tangkapTawaran)
    window.addEventListener('appinstalled', tandaiTerpasang)

    return () => {
      window.removeEventListener('beforeinstallprompt', tangkapTawaran)
      window.removeEventListener('appinstalled', tandaiTerpasang)
    }
  }, [])

  // Umumkan tinggi tawaran ke CSS lewat variabel --tinggi-banner-pasang.
  // Dipakai beranda satu layar supaya kartu paling bawah tidak tertutup.
  const tampil = !sudahTerpasang && !ditolak && Boolean(tawaran) && HALAMAN_TAWAR_PASANG.includes(pathname)

  useEffect(() => {
    const el = bannerRef.current
    const akar = document.documentElement
    if (!tampil || !el) {
      akar.style.removeProperty('--tinggi-banner-pasang')
      return
    }
    const atur = () => {
      akar.style.setProperty('--tinggi-banner-pasang', `${el.offsetHeight}px`)
    }
    atur()
    const pengamat = new ResizeObserver(atur)
    pengamat.observe(el)
    window.addEventListener('resize', atur)
    return () => {
      pengamat.disconnect()
      window.removeEventListener('resize', atur)
      akar.style.removeProperty('--tinggi-banner-pasang')
    }
  }, [tampil])

  if (sudahTerpasang || ditolak || !tawaran || !HALAMAN_TAWAR_PASANG.includes(pathname)) {
    return null
  }

  const pasang = async () => {
    await tawaran.prompt()
    const pilihan = await tawaran.userChoice
    if (pilihan?.outcome === 'accepted') setSudahTerpasang(true)
    setTawaran(null)
  }

  const tutup = () => {
    // Diingat supaya tombol tidak muncul terus bagi yang memang tidak mau.
    window.localStorage.setItem('lintasair-install-ditolak', '1')
    setDitolak(true)
  }

  return (
    <div ref={bannerRef} data-pwa-banner className="fixed inset-x-3 bottom-3 z-50 sm:inset-x-auto sm:right-4 sm:w-80">
      <div className="pwa-kotak flex items-center gap-3 rounded-2xl bg-gradient-to-r from-purple-700 to-violet-600 p-3 text-white shadow-xl ring-1 ring-black/10">
        <Image
          src="/images/icon-192.png"
          alt="LintasAir"
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Pasang LintasAir</p>
          <p className="pwa-catatan text-[11px] leading-tight text-purple-100">Buka lebih cepat, layar penuh</p>
        </div>
        <button
          type="button"
          onClick={pasang}
          className="rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-50"
        >
          Pasang
        </button>
        <button
          type="button"
          onClick={tutup}
          aria-label="Tutup tawaran pasang aplikasi"
          className="px-1 text-lg leading-none text-purple-200 hover:text-white"
        >
          ×
        </button>
      </div>
    </div>
  )
}
