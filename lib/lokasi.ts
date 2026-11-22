'use client'

// lib/lokasi.ts
// SUMBER TUNGGAL pilihan "Lokasi Operasional" / "Lokasi Tugas" untuk:
//   - Manajemen Agen  (/agen-tenant, /dashboard-superadmin/agen)
//   - Manajemen Petugas Keberangkatan & Kolektor (/superadmin/pusat-kontrol/admin/petugas/...)
//   - Filter Pelabuhan Laporan Syahbandar
//
// ATURAN: daftar TIDAK BOLEH di-hardcode lagi. Ambil dari Master Rute (Daerah):
//   1) tabel master_kota  -> menu Superadmin "Master Rute (Daerah)"
//   2) ujung rute di master_rute (rute_asal & rute_tujuan) sebagai pelengkap,
//      supaya daerah yang belum masuk kamus tetap muncul di dropdown.
// Cadangan (hanya kalau kedua tabel benar-benar kosong/gagal): Tarakan & Tanjung Selor.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export const LOKASI_CADANGAN = ['Tarakan', 'Tanjung Selor']

/** Urutan baku: Tarakan, Tanjung Selor, lalu alfabetis (sama dengan Laporan Gabungan). */
export function urutkanLokasi(daftar: string[]): string[] {
  const posisi = (nama: string) => (nama === 'Tarakan' ? 0 : nama === 'Tanjung Selor' ? 1 : 2)
  return [...daftar].sort((a, b) => {
    const selisih = posisi(a) - posisi(b)
    return selisih !== 0 ? selisih : a.localeCompare(b)
  })
}

/**
 * Pilihan dropdown yang aman: daftar Master Rute + nilai lama yang sedang dipakai.
 * Nilai lama ditempel di depan hanya kalau memang belum ada di Master Rute,
 * supaya data agen/petugas lama tidak hilang saat diedit.
 */
export function pilihanLokasi(daftar: string[], nilaiSekarang?: string | null): string[] {
  const hasil = [...daftar]
  const nilai = String(nilaiSekarang || '').trim()
  if (nilai && !hasil.includes(nilai)) hasil.unshift(nilai)
  return hasil
}

/** Ambil daftar lokasi operasional dari Master Rute (master_kota + master_rute). */
export async function muatLokasiOperasional(): Promise<string[]> {
  const kumpulan: string[] = []

  try {
    const { data: kota } = await supabase
      .from('master_kota')
      .select('nama_kota')
      .order('nama_kota')

    ;(kota || []).forEach((k: any) => kumpulan.push(String(k?.nama_kota || '')))
  } catch {
    // diamkan: lanjut ke sumber berikutnya
  }

  try {
    const { data: rute } = await supabase
      .from('master_rute')
      .select('rute_asal, rute_tujuan')

    ;(rute || []).forEach((r: any) => {
      kumpulan.push(String(r?.rute_asal || ''))
      kumpulan.push(String(r?.rute_tujuan || ''))
    })
  } catch {
    // diamkan: pakai hasil yang sudah terkumpul
  }

  const unik = Array.from(
    new Set(kumpulan.map((s) => s.trim()).filter((s) => s.length > 0))
  )

  return unik.length > 0 ? urutkanLokasi(unik) : [...LOKASI_CADANGAN]
}

/** Hook siap pakai di komponen client. */
export function useLokasiOperasional() {
  const [lokasiList, setLokasiList] = useState<string[]>([...LOKASI_CADANGAN])
  const [memuatLokasi, setMemuatLokasi] = useState(true)

  useEffect(() => {
    let masihDipakai = true

    muatLokasiOperasional()
      .then((list) => {
        if (masihDipakai) setLokasiList(list)
      })
      .finally(() => {
        if (masihDipakai) setMemuatLokasi(false)
      })

    return () => {
      masihDipakai = false
    }
  }, [])

  return { lokasiList, memuatLokasi }
}
