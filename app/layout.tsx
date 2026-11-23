import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SessionGuard from "@/components/SessionGuard";
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
// domain (vercel.app -> www.lintasair.com) cukup ganti env + redeploy.
const SITUS = (process.env.NEXT_PUBLIC_SITE_URL || "https://tiket-kapal.vercel.app")
  .trim()
  .replace(/\/+$/, "")

const BOLEH_DIINDEKS = process.env.NEXT_PUBLIC_INDEXABLE === "true"

function alamatSitus(): URL {
  try {
    return new URL(SITUS)
  } catch {
    return new URL("https://tiket-kapal.vercel.app")
  }
}

export const metadata: Metadata = {
  metadataBase: alamatSitus(),
  title: "Tiket Kapal Kaltara",
  description: "Sistem Penjualan Tiket Kapal Kalimantan Utara",
  robots: BOLEH_DIINDEKS
    ? { index: true, follow: true }
    : { index: false, follow: false },
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
      </body>
    </html>
  );
}