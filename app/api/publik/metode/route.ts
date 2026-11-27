// app/api/publik/metode/route.ts
// Daftar metode pembayaran + BIAYA LAYANAN untuk satu transaksi online.
//
// Dipakai halaman /pembayaran SEBELUM pembeli memilih metode: pembeli melihat
// total tiap kanal (QRIS, VA, retail, e-wallet, transfer manual) lalu memilih
// yang paling murah. Nominal dasar dihitung dari database (harga jadwal x
// jumlah dewasa), bukan dikirim browser, supaya tidak bisa diakali.

import { NextResponse } from 'next/server'
import { buatClientAdmin, pesanServiceKeyKosong } from '@/lib/serverAuth'
import { catatPermintaan, kenaBatas, kunciIp } from '@/lib/rateLimit'
import { asalDiizinkan } from '@/lib/publikGuard'
import { ambilMetodeAktif } from '@/lib/payment/layanan'
import { kodeTermurah, ringkasMetode } from '@/lib/payment/tarif'

const BATAS = 120
const JENDELA = 10 * 60 * 1000

function ambilIds(param: string | null): string[] {
  const ids = String(param || '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => /^[0-9a-f-]{36}$/i.test(x))
  return [...new Set(ids)].slice(0, 20)
}

export async function GET(request: Request) {
  const tolakAsal = asalDiizinkan(request)
  if (tolakAsal) return tolakAsal

  const admin = buatClientAdmin()
  if (!admin) return pesanServiceKeyKosong()

  const kunci = kunciIp(request, 'publik-metode')
  if (kenaBatas(kunci, BATAS, JENDELA)) {
    return NextResponse.json({ error: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' }, { status: 429 })
  }

  const ids = ambilIds(new URL(request.url).searchParams.get('pesanan'))
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Daftar pesanan tidak valid.' }, { status: 400 })
  }

  const { data: rows, error: errRows } = await admin
    .from('pesanan')
    .select('id, jadwal_id, is_balita, status')
    .in('id', ids)

  if (errRows) {
    return NextResponse.json({ error: 'Gagal membaca pesanan: ' + errRows.message }, { status: 500 })
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'Pesanan tidak ditemukan.' }, { status: 404 })
  }

  const daftar = rows as any[]
  const jadwalIds = [...new Set(daftar.map((r) => String(r.jadwal_id || '')))]
  if (jadwalIds.length > 1) {
    // Satu tagihan online hanya mencakup satu keberangkatan.
    return NextResponse.json({ error: 'Pesanan berasal dari jadwal berbeda.' }, { status: 400 })
  }

  const { data: jadwal } = await admin
    .from('jadwal')
    .select('harga')
    .eq('id', jadwalIds[0])
    .maybeSingle()

  const harga = Math.max(0, Math.round(Number((jadwal as any)?.harga || 0)))
  const dewasa = daftar.filter((r) => !r.is_balita).length
  const dasar = harga * dewasa

  const tarif = await ambilMetodeAktif(admin)
  const metode = ringkasMetode(dasar, tarif)

  catatPermintaan(kunci, JENDELA)

  return NextResponse.json({
    dasar,
    harga,
    jumlahDewasa: dewasa,
    jumlahTiket: daftar.length,
    termurah: kodeTermurah(metode),
    metode,
  })
}
