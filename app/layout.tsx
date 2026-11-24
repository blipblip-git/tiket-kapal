import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SessionGuard from "@/components/SessionGuard";
import PwaInstall from "@/components/PwaInstall";
import { Suspense } from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Alamat situs & izin indeks mesin pencari diatur lewat env, supaya pindah
// domain cukup ganti env + redeploy. Fallback-nya sudah domain produksi
// (www.lintasair.com) agar canonical/OG tidak nyasar ke alamat vercel.app.
const SITUS = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.lintasair.com")
  .trim()
  .replace(/\/+$/, "")

const BOLEH_DIINDEKS = process.env.NEXT_PUBLIC_INDEXABLE === "true"

function alamatSitus(): URL {
  try {
    return new URL(SITUS)
  } catch {
    return new URL("https://www.lintasair.com")
  }
}

export const metadata: Metadata = {
  metadataBase: alamatSitus(),
  applicationName: "LintasAir",
  title: "LintasAir - Tiket Kapal Kaltara",
  description: "Sistem Penjualan Tiket Kapal Kalimantan Utara",
  // Manifest PWA: membuat situs bisa DIPASANG dan dibuka tanpa address bar.
  manifest: "/api/manifest",
  robots: BOLEH_DIINDEKS
    ? { index: true, follow: true }
    : { index: false, follow: false },
  // Safari iOS tidak memakai manifest untuk mode layar penuh, jadi diatur di sini.
  appleWebApp: {
    capable: true,
    title: "LintasAir",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
  // Pratinjau saat link dibagikan di WhatsApp/Facebook (pakai logo wordmark LintasAir).
  openGraph: {
    type: "website",
    locale: "id_ID",
    siteName: "LintasAir",
    title: "LintasAir - Tiket Kapal Kaltara",
    description:
      "Pesan tiket kapal Kalimantan Utara lebih cepat: cari jadwal, bayar, e-tiket langsung di HP.",
    url: SITUS,
    images: [
      {
        url: "/images/og-lintasair.jpg",
        width: 1200,
        height: 630,
        alt: "LintasAir",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LintasAir - Tiket Kapal Kaltara",
    description:
      "Pesan tiket kapal Kalimantan Utara lebih cepat: cari jadwal, bayar, e-tiket langsung di HP.",
    images: ["/images/og-lintasair.jpg"],
  },
  other: {
    google: "notranslate",
  },
};

// Izinkan pengguna melakukan pinch-zoom di HP/tablet (jangan dikunci 1x).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  // Warna bar browser HP ikut ungu LintasAir, bukan putih.
  themeColor: "#6D28D9",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      translate="no"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased notranslate`}
    >
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <SessionGuard />
        </Suspense>
        {children}
        {/* Tombol "Pasang Aplikasi" (muncul hanya kalau browser mendukung). */}
        <PwaInstall />
      </body>
    </html>
  );
}