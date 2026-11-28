// components/DemoBadge.tsx
// Penanda bahwa instalasi ini adalah DEMO.
//
// Aturan yang dijaga file ini:
// - Muncul di SETIAP halaman (dipasang di app/layout.tsx), karena pengunjung
//   tidak boleh mengira data simulasi sebagai data produksi.
// - Diletakkan di alur normal (bukan position: fixed) supaya tidak menutupi
//   tombol apa pun di dashboard yang sempit di HP.
// - Hilang otomatis saat dicetak (tiket/manifest) dan TIDAK PERNAH muncul di
//   REAL, karena hanya dirender kalau env DEMO_MODE/NEXT_PUBLIC_DEMO_MODE=true.

const MODE_DEMO =
  process.env.DEMO_MODE === 'true' || process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

export default function DemoBadge() {
  if (!MODE_DEMO) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center bg-amber-400 px-3 py-1 leading-tight print:hidden"
    >
      <span className="rounded bg-amber-950 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-50">
        Demo
      </span>
    </div>
  )
}

