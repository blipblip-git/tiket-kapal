// components/IkonKapal.tsx
//
// Ilustrasi kapal cepat (speedboat) LintasAir — dipakai ulang di beranda,
// halaman Jadwal Kapal, dan Pilih Jadwal supaya semua gambar kapal seragam.
//
// Model mengikuti sketsa pemilik: buritan dengan mesin tempel, hardtop miring,
// kaca depan, dan pagar haluan. Dua varian:
//   - "warna" : ilustrasi berisi warna (hull putih, aksen ungu, kaca biru)
//   - "garis" : garis satu warna memakai currentColor, untuk ukuran kecil
//
// Ukuran diatur lewat className (mis. "w-[96px]" atau "w-10"), rasio 2:1.

type Props = {
  className?: string
  variant?: 'warna' | 'garis'
  // Riak air di bawah kapal. Bagus untuk ukuran besar, jangan dipakai di ikon
  // kecil karena garisnya jadi penuh.
  ombak?: boolean
  // Kalau diisi, ikon dibacakan pembaca layar sebagai gambar dengan judul ini.
  judul?: string
}

const TINTA = '#3b0764'

export default function IkonKapal({
  className = 'w-24',
  variant = 'warna',
  ombak = false,
  judul
}: Props) {
  const garis = variant === 'garis'
  const tinta = garis ? 'currentColor' : TINTA
  // Tebal garis asas. Pada ukuran kecil SVG diperkecil otomatis, jadi jangan
  // diturunkan lagi atau kapalnya jadi pucat.
  const tebal = 4.5

  return (
    <svg
      viewBox={ombak ? '0 0 240 120' : '0 24 240 82'}
      className={className}
      role={judul ? 'img' : undefined}
      aria-hidden={judul ? undefined : true}
      aria-label={judul}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Mesin tempel di buritan (digambar dulu supaya tertutup lambung kapal) */}
      <path
        d="M26 61 Q25 55 32 54 L45 52 Q51 52 52 59 L53 73 Q53 80 46 80 L34 80 Q28 80 28 74 Z"
        fill={garis ? 'none' : '#f8fafc'}
        stroke={tinta}
        strokeWidth={tebal}
        strokeLinejoin="round"
      />
      <path d="M40 80 L40 103" stroke={tinta} strokeWidth={tebal} strokeLinecap="round" />
      <path d="M34 103 L46 103" stroke={tinta} strokeWidth={tebal} strokeLinecap="round" />

      {/* Lambung: garis geladak, buritan, dan lunas */}
      <path
        d="M46 73 C112 68 178 62 228 55 C205 84 175 95 141 99 C112 102 72 102 50 101 Z"
        fill={garis ? 'none' : '#ffffff'}
        stroke={tinta}
        strokeWidth={garis ? tebal : 5}
        strokeLinejoin="round"
      />

      {/* Pita aksen di sisi lambung + garis strake */}
      {!garis && (
        <path d="M46 73 C112 68 178 62 228 55 L212 65 C172 71 112 78 48 84 Z" fill="#c4b5fd" />
      )}
      <path
        d="M48 84 C112 78 172 71 212 65"
        stroke={tinta}
        strokeWidth={tebal}
        strokeLinecap="round"
      />

      {/* Kaca depan */}
      <path
        d="M126 63 L182 57 L172 36 L136 38 Z"
        fill={garis ? 'none' : '#60a5fa'}
        stroke={tinta}
        strokeWidth={tebal}
        strokeLinejoin="round"
      />
      {!garis && <path d="M140 41 L168 39 L172 47 L136 51 Z" fill="#93c5fd" />}

      {/* Hardtop + penyangga belakang */}
      <path
        d="M92 44 C98 33 114 28 132 27 L162 27 C169 27 173 30 175 34 L169 37 L133 38 C118 38 106 40 98 43 Z"
        fill={garis ? 'none' : '#ddd6fe'}
        stroke={tinta}
        strokeWidth={tebal - 0.5}
        strokeLinejoin="round"
      />
      <path d="M94 43 L108 62" stroke={tinta} strokeWidth={tebal} strokeLinecap="round" />

      {/* Pagar haluan */}
      <path d="M198 50 C206 47 214 46 224 47" stroke={tinta} strokeWidth={4} strokeLinecap="round" />
      <path d="M203 49 L204 60" stroke={tinta} strokeWidth={4} strokeLinecap="round" />
      <path d="M214 47 L215 58" stroke={tinta} strokeWidth={4} strokeLinecap="round" />
      <path d="M225 47 L228 55" stroke={tinta} strokeWidth={4} strokeLinecap="round" />

      {/* Riak air (hanya kalau diminta & varian warna) */}
      {ombak && !garis && (
        <g stroke="#8b5cf6" strokeWidth={5} strokeLinecap="round" opacity={0.45}>
          <path d="M40 112 C52 108 62 116 74 112" />
          <path d="M92 114 C104 110 114 118 126 114" />
          <path d="M146 112 C158 108 168 116 180 112" />
        </g>
      )}
    </svg>
  )
}
