// app/syahbandar/layout.tsx
// Sama seperti /cek-tiket: halaman ini client component, jadi canonical
// dipasang lewat layout tipis agar tidak mewarisi canonical beranda.
//
// Sejak portal syahbandar wajib login, halaman ini juga ditutup dari mesin
// pencari (noindex) — isinya nama penumpang dan status boarding.
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  alternates: { canonical: "/syahbandar" },
  robots: { index: false, follow: false },
};

export default function SyahbandarLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
