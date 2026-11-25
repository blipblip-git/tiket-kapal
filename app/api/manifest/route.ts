import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  // Ambil referer (halaman asal) untuk mendeteksi apakah ini dari /login atau bukan
  const referer = request.headers.get('referer') || ''
  const isLoginPage = referer.includes('/login')

  const manifest = {
    // /login punya identitas PWA SENDIRI: `id` dibedakan supaya Android membuat
    // ikon kedua ("Login"), tidak menimpa aplikasi pembeli yang sudah terpasang.
    // `scope` tetap "/" agar setelah login pengguna tetap berada di jendela
    // aplikasi saat berpindah ke /syahbandar atau dashboard.
    id: isLoginPage ? "/login" : "/",
    name: isLoginPage ? "Login Petugas/Agen dan Syahbandar" : "LintasAir - Tiket Kapal Kaltara",
    short_name: isLoginPage ? "Login" : "LintasAir",
    description: isLoginPage ? "Halaman masuk petugas/agen dan syahbandar." : "Sistem Pembelian Tiket Kapal Kaltara",
    lang: "id",
    dir: "ltr",
    start_url: isLoginPage ? "/login" : "/",
    scope: "/",
    display: "standalone",
    // Android memakai nilai pertama yang dikenali: tampil penuh tanpa address
    // bar, sehingga terasa seperti aplikasi asli.
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    // Warna splash screen mengikuti latar logo (navi gelap), bukan putih.
    background_color: "#0B0620",
    theme_color: isLoginPage ? "#1D4ED8" : "#6D28D9",
    categories: ["travel", "navigation"],
    prefer_related_applications: false,
    icons: [
      // "any" = ikon apa adanya (cincin putih logo tetap terlihat), dipakai di
      // layar kotak seperti desktop.
      {
        src: "/images/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/images/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      // "maskable" = gambar mengisi penuh seluruh kotak tanpa cincin/latar putih.
      // Inilah yang menghilangkan bulatan putih bawaan Android di belakang ikon.
      {
        src: "/images/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable"
      },
      {
        src: "/images/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ],
    // Menu cepat saat ikon aplikasi ditekan lama di layar HP.
    shortcuts: isLoginPage
      ? []
      : [
          {
            name: "Cari Jadwal Kapal",
            short_name: "Cari Jadwal",
            url: "/cari-tiket",
            icons: [{ src: "/images/icon-192.png", sizes: "192x192" }]
          },
          {
            name: "Cek Tiket / Transaksi",
            short_name: "Cek Tiket",
            url: "/cek-tiket",
            icons: [{ src: "/images/icon-192.png", sizes: "192x192" }]
          }
        ]
  }

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      // Jangan di-cache: identitas manifest bergantung pada halaman asal
      // (pembeli vs /login), jadi versi lama bisa salah dipakai saat install.
      'Cache-Control': 'no-store',
    },
  })
}