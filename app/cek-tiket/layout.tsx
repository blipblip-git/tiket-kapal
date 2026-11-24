// app/cek-tiket/layout.tsx
// Halaman /cek-tiket adalah client component ("use client") sehingga tidak bisa
// mengekspor metadata. Layout tipis ini hanya menambahkan canonical milik
// halaman itu sendiri — kalau canonical ditaruh di layout root, semua halaman
// akan mengaku sebagai beranda dan /cek-tiket bisa dibuang Google.
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  alternates: { canonical: "/cek-tiket" },
};

export default function CekTiketLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
