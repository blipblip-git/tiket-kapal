// app/api/kolektor/laporan/route.ts
// Laporan penjualan harian KHUSUS akun Kolektor.
//
// Aturan:
// - Kolektor hanya boleh melihat penjualan dari AGEN / PETUGAS yang lokasinya
//   sama dengan lokasi kolektor, dan masih dalam operator (PT) yang sama.
// - Penyaringan dilakukan di SERVER memakai service role, jadi lokasi tidak
//   bisa diganti lewat URL (?lokasi=...) dari browser.
// - Browser kolektor tidak lagi membaca tabel pesanan/pembayaran langsung.

import { NextResponse } from 'next/server'
import { buatClientAdmin, pesanServiceKeyKosong } from '@/lib/serverAuth'
import { verifikasiTokenSesi } from '@/lib/sessionToken'

const ROLE_PENJUAL = ['agen', 'terminal_keberangkatan', 'petugas_loket', 'petugas_mobile']

type ProfilPenjual = {
  nama: string | null
  email: string | null
  nomor_hp: string | null
}

/** Semua variasi identitas penjual (nama / email / nomor HP). */
function identitasPenjual(p: ProfilPenjual): string[] {
  const hasil: string[] = []
  const nama = String(p.nama || '').trim().toLowerCase()
  if (nama) hasil.push(nama)

  const email = String(p.email || '').trim().toLowerCase()
  if (email) hasil.push(email)

  tambahVariasiHp(hasil, String(p.nomor_hp || ''))
  return hasil
}

/** Variasi identitas dari kolom pesanan.petugas_jual. */
function identitasPesanan(mentah: string | null): string[] {
  const teks = String(mentah || '').trim().toLowerCase()
  if (!teks) return []

  const hasil: string[] = [teks]
  // Format lama: email/no HP + domain, atau nama.
  const bagianDepan = teks.includes('@') ? teks.split('@')[0] : teks
  const digit = bagianDepan.replace(/\D/g, '')
  if (digit) {
    hasil.push(digit, digit.replace(/^62/, '0'), digit.replace(/^0/, '62'))
    if (digit.length > 9) hasil.push(digit.slice(-9))
  }
  return hasil
}

function tambahVariasiHp(hasil: string[], nomor: string) {
  const digit = nomor.replace(/\D/g, '')
  if (!digit) return
  hasil.push(digit, digit.replace(/^62/, '0'), digit.replace(/^0/, '62'))
  if (digit.length > 9) hasil.push(digit.slice(-9))
}

export async function GET(request: Request) {
  const admin = buatClientAdmin()
  if (!admin) return pesanServiceKeyKosong()

  const header = request.headers.get('authorization') || ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  const sesi = verifikasiTokenSesi(token)
  if (!sesi) {
    return NextResponse.json(
      { error: 'Sesi kolektor tidak valid atau sudah kedaluwarsa. Silakan login ulang.' },
      { status: 401 }
    )
  }

  const { data: profil, error: errorProfil } = await admin
    .from('profiles')
    .select('id, nama, role, lokasi, operator_id, aktif')
    .eq('id', sesi.sub)
    .maybeSingle()

  if (errorProfil) {
    return NextResponse.json({ error: 'Gagal memeriksa akun: ' + errorProfil.message }, { status: 500 })
  }
  if (!profil || String(profil.role || '').trim().toLowerCase() !== 'kolektor' || profil.aktif === false) {
    return NextResponse.json({ error: 'Akses ditolak. Akun ini bukan kolektor aktif.' }, { status: 403 })
  }

  const lokasi = String(profil.lokasi || '').trim()
  if (!lokasi) {
    return NextResponse.json(
      { error: 'Akun kolektor belum punya lokasi tugas. Hubungi Admin Utama.' },
      { status: 400 }
    )
  }

  const url = new URL(request.url)
  const tanggal = String(url.searchParams.get('tanggal') || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
    return NextResponse.json({ error: 'Tanggal tidak valid (format YYYY-MM-DD).' }, { status: 400 })
  }

  // 1) Daftar penjual lokal: agen/petugas di lokasi kolektor + operator yang sama.
  let qPenjual = admin
    .from('profiles')
    .select('nama, email, nomor_hp, role, lokasi')
    .in('role', ROLE_PENJUAL)
    .eq('lokasi', lokasi)

  if (profil.operator_id) {
    // Sertakan akun lama yang operator_id-nya masih NULL.
    qPenjual = qPenjual.or(`operator_id.eq.${profil.operator_id},operator_id.is.null`)
  }

  const { data: dataPenjual, error: errorPenjual } = await qPenjual
  if (errorPenjual) {
    return NextResponse.json({ error: 'Gagal memuat daftar penjual: ' + errorPenjual.message }, { status: 500 })
  }

  const identitasLokal = new Set<string>()
  ;(dataPenjual || []).forEach((p: ProfilPenjual) => {
    identitasPenjual(p).forEach((x) => identitasLokal.add(x))
  })

  const profilPublik = { nama: profil.nama || null, lokasi }

  if (identitasLokal.size === 0) {
    return NextResponse.json({ profil: profilPublik, pesanan: [], pembayaran: [] })
  }

  // 2) Penjualan tanggal tersebut.
  const { data: dataPesanan, error: errorPesanan } = await admin
    .from('pesanan')
    .select(`
      id, nama_penumpang, kode_tiket, kanal, status, status_boarding, waktu_boarding, petugas_jual, is_balita,
      jadwal:jadwal_id (rute_asal, rute_tujuan, harga, tanggal, jam_berangkat, status_jadwal, kapal_id, operator_id),
      kursi:kursi_id (nomor_kursi)
    `)
    .eq('status', 'paid')
    .eq('jadwal.tanggal', tanggal)
    .limit(5000)

  if (errorPesanan) {
    return NextResponse.json({ error: 'Gagal memuat penjualan: ' + errorPesanan.message }, { status: 500 })
  }

  const pesanan = (dataPesanan || []).filter((p: any) => {
    if (!p.jadwal) return false
    return identitasPesanan(p.petugas_jual).some((x) => identitasLokal.has(x))
  })

  // 3) Metode pembayaran (Cash / QRIS).
  let pembayaran: { pesanan_id: string; metode: string | null }[] = []
  if (pesanan.length > 0) {
    const { data: dataPembayaran, error: errorPembayaran } = await admin
      .from('pembayaran')
      .select('pesanan_id, metode')
      .in('pesanan_id', pesanan.map((p: any) => p.id))

    if (errorPembayaran) {
      return NextResponse.json({ error: 'Gagal memuat pembayaran: ' + errorPembayaran.message }, { status: 500 })
    }
    pembayaran = (dataPembayaran || []) as { pesanan_id: string; metode: string | null }[]
  }

  return NextResponse.json({ profil: profilPublik, pesanan, pembayaran })
}
