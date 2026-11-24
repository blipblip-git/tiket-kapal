// lib/geo.ts
// Sumber tunggal koordinat kota untuk DETEKSI LOKASI OTOMATIS:
//   - Beranda pembeli (kolom "Dari" terisi kota terdekat)
//   - Portal Syahbandar (daerah tugas terpilih otomatis)
//
// Kota yang tidak ada di sini hanya tidak ikut terdeteksi (tetap bisa dipilih manual).

export const RADIUS_DETEKSI_KM = 25

export const KOORDINAT_KOTA: Record<string, { lat: number; lng: number }> = {
  'Berau': { lat: 2.1531, lng: 117.4957 },
  'Bunyu': { lat: 3.5200, lng: 117.8069 },
  'Kabupaten Tanah Tidung': { lat: 3.5855, lng: 116.9078 },
  'Malinau': { lat: 3.5892, lng: 116.6222 },
  'Nunukan': { lat: 4.1404, lng: 117.6511 },
  'Sebatik': { lat: 4.1333, lng: 117.7667 },
  'Sembakung': { lat: 3.8569, lng: 117.0318 },
  'Sungai Nyamuk': { lat: 4.1426, lng: 117.9117 },
  'Tanah Kuning': { lat: 2.6027, lng: 117.8172 },
  'Tanjung Batu': { lat: 2.2762, lng: 118.0876 },
  'Tanjung Selor': { lat: 2.8430, lng: 117.3613 },
  'Tarakan': { lat: 3.3000, lng: 117.6330 }
}

/** Jarak dua titik (km) memakai rumus haversine. */
export function jarakKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Kota terdekat dari posisi pengguna, HANYA dari daftar nama yang diberikan
 * (mis. daerah yang punya rute). Hasil null kalau tidak ada yang punya koordinat.
 */
export function kotaTerdekat(
  lat: number,
  lng: number,
  daftarNama: string[]
): { nama: string; jarak: number } | null {
  let kandidat = ''
  let jarakTerdekat = Number.POSITIVE_INFINITY

  daftarNama.forEach((nama) => {
    const koord = KOORDINAT_KOTA[nama]
    if (!koord) return
    const jarak = jarakKm(lat, lng, koord.lat, koord.lng)
    if (jarak < jarakTerdekat) {
      jarakTerdekat = jarak
      kandidat = nama
    }
  })

  if (!kandidat) return null
  return { nama: kandidat, jarak: jarakTerdekat }
}
