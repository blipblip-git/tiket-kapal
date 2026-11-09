import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  // Ambil referer (halaman asal) untuk mendeteksi apakah ini dari /login atau bukan
  const referer = request.headers.get('referer') || ''
  const isLoginPage = referer.includes('/login')

  const manifest = {
    name: isLoginPage ? "Tempakul - Login Petugas" : "Tempakul - Pesan Tiket",
    short_name: isLoginPage ? "Login Petugas" : "Tempakul",
    description: isLoginPage ? "Sistem Login Petugas Tiket Kapal Kaltara" : "Sistem Pembelian Tiket Kapal Kaltara",
    start_url: isLoginPage ? "/login" : "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: isLoginPage ? "#2563eb" : "#7e22ce",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "64x64 32x32 24x24 16x16",
        type: "image/x-icon"
      }
    ]
  }

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
    },
  })
}