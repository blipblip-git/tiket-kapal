// app/syahbandar/layout.tsx
// Sama seperti /cek-tiket: halaman ini client component, jadi canonical
// dipasang lewat layout tipis agar tidak mewarisi canonical beranda.
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  alternates: { canonical: "/syahbandar" },
};

export default function SyahbandarLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
