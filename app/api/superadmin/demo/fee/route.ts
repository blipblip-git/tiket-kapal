import { connection, NextResponse } from 'next/server'
import { wajibSuperadmin } from '@/lib/serverAuth'
import { buatClientDemoAdmin, pesanError, statusDemo } from '@/lib/demoServer'
import { bulanSekarang, daftarTanggalBulan, parseBulan } from '@/lib/periode'

type BarisPesananDemo = {
  is_balita?: boolean | null
  kanal?: string | null
  fee_platform?: number | null
  jadwal?: {
    tanggal?: string | null
    jam_berangkat?: string | null
    operator_id?: string | null
    kapal_id?: string | null
    kapal?: { nama?: string | null } | null
  } | null
}

type RingkasPenyewa = {
  operatorId: string
  namaPenyewa: string
  tiket: number
  total: number
}

type BarisPengaturan = {
  fee_platform?: number | null
  fee_offline?: number | null
  fee_online?: number | null
}

type BarisKapal = {
  id: string
  operator_id?: string | null
}

type BarisProfil = {
  id: string
  nama?: string | null
  nama_perusahaan?: string | null
}

const KANAL_FEE = ['agen', 'loket', 'mobile', 'keberangkatan', 'petugas', 'online']

/**
 * Fee Demo = fee platform dari transaksi yang BENAR-BENAR ada di database demo.
 * Tidak ada angka contoh. Kalau demo belum punya transaksi, hasilnya nol.
 */
export async function GET(request: Request) {
  try {
    // Cache Components: hentikan prerender sebelum membaca header Authorization.
    await connection()

    const auth = await wajibSuperadmin(request)
    if (!auth.ok) return auth.response

    const status = statusDemo()
    if (!status.siap) {
      return NextResponse.json({ error: status.alasan }, { status: 503 })
    }

    const demo = buatClientDemoAdmin()
    if (!demo) {
      return NextResponse.json({ error: 'Klien database demo tidak tersedia.' }, { status: 503 })
    }

    const url = new URL(request.url)
    const bulanDiminta = String(url.searchParams.get('bulan') || '').trim()
    const bulan = parseBulan(bulanDiminta) ? bulanDiminta : bulanSekarang()
    const tanggalList = daftarTanggalBulan(bulan)

    let feeOffline = 0
    let feeOnline = 0
    const { data: pengaturan, error: errPengaturan } = await demo
      .from('pengaturan_platform')
      .select('fee_offline, fee_online, fee_platform')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!errPengaturan && pengaturan) {
      const baris = pengaturan as BarisPengaturan
      feeOffline = Math.max(0, Math.round(Number(baris.fee_offline) || 0))
      feeOnline = Math.max(0, Math.round(Number(baris.fee_online) || 0))
    } else {
      // Kolom fee_offline/fee_online belum ada -> pakai kolom lama.
      const { data: lama } = await demo
        .from('pengaturan_platform')
        .select('fee_platform')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const nilai = Number((lama as BarisPengaturan)?.fee_platform || 0)
      if (Number.isFinite(nilai) && nilai > 0) feeOffline = Math.round(nilai)
      feeOnline = feeOffline
    }
    const feeBerlaku = feeOffline

    const kolomDasar = [
      'id, is_balita, kanal',
      'jadwal:jadwal_id (tanggal, jam_berangkat, operator_id, kapal_id, kapal:kapal_id(nama))'
    ].join(', ')

    let pakaiSnapshot = true
    let hasil = await demo
      .from('pesanan')
      .select(`id, is_balita, kanal, fee_platform, jadwal:jadwal_id (tanggal, jam_berangkat, operator_id, kapal_id, kapal:kapal_id(nama))`)
      .eq('status', 'paid')
      .in('kanal', KANAL_FEE)
      .gte('jadwal.tanggal', tanggalList[0])
      .lte('jadwal.tanggal', tanggalList[tanggalList.length - 1])

    if (hasil.error && /fee_platform|column|schema cache|does not exist/i.test(hasil.error.message || '')) {
      pakaiSnapshot = false
      hasil = await demo
        .from('pesanan')
        .select(kolomDasar)
        .eq('status', 'paid')
        .in('kanal', KANAL_FEE)
        .gte('jadwal.tanggal', tanggalList[0])
        .lte('jadwal.tanggal', tanggalList[tanggalList.length - 1])
    }

    if (hasil.error) {
      return NextResponse.json(
        { error: 'Gagal membaca transaksi demo: ' + hasil.error.message },
        { status: 500 }
      )
    }

    const baris = (hasil.data || []) as unknown as BarisPesananDemo[]

    // Pemilik jadwal: utamakan jadwal.operator_id; data lama memakai kapal.operator_id.
    const kapalIds = [...new Set(baris.map((p) => p.jadwal?.kapal_id).filter(Boolean) as string[])]
    const petaKapal = new Map<string, string | null>()
    if (kapalIds.length > 0) {
      const { data: kapal } = await demo.from('kapal').select('id, operator_id').in('id', kapalIds)
      ;((kapal || []) as BarisKapal[]).forEach((k) => petaKapal.set(k.id, k.operator_id || null))
    }

    const { data: penyewa } = await demo
      .from('profiles')
      .select('id, nama, nama_perusahaan, role')
      .eq('role', 'admin_utama')

    const namaPenyewa = new Map<string, string>()
    ;((penyewa || []) as BarisProfil[]).forEach((p) => {
      namaPenyewa.set(p.id, String(p.nama_perusahaan || p.nama || '').trim() || 'Penyewa')
    })

    const peta = new Map<string, RingkasPenyewa>()

    baris.forEach((pesanan) => {
      if (pesanan.is_balita) return
      const jadwal = pesanan.jadwal
      if (!jadwal || !jadwal.tanggal) return

      const pemilik =
        jadwal.operator_id ||
        (jadwal.kapal_id ? petaKapal.get(jadwal.kapal_id) : null) ||
        'tanpa-penyewa'

      if (!peta.has(pemilik)) {
        peta.set(pemilik, {
          operatorId: pemilik,
          namaPenyewa: namaPenyewa.get(pemilik) || 'Penyewa tidak terdaftar',
          tiket: 0,
          total: 0
        })
      }

      const ringkas = peta.get(pemilik)!
      const snapshot = Number(pesanan.fee_platform || 0)
      const cadangan = String(pesanan.kanal || '').toLowerCase() === 'online' ? feeOnline : feeOffline
      const feeBaris = snapshot > 0 ? Math.round(snapshot) : cadangan

      ringkas.tiket += 1
      ringkas.total += feeBaris
    })

    const daftar = Array.from(peta.values()).sort((a, b) =>
      a.namaPenyewa.localeCompare(b.namaPenyewa)
    )

    return NextResponse.json({
      bulan,
      feeBerlaku,
      feeOnline,
      pakaiSnapshot,
      totalTiket: daftar.reduce((sum, p) => sum + p.tiket, 0),
      totalFee: daftar.reduce((sum, p) => sum + p.total, 0),
      penyewa: daftar
    })
  } catch (error: unknown) {
    console.error('Error fee demo:', error)
    return NextResponse.json({ error: 'Server Error: ' + pesanError(error) }, { status: 500 })
  }
}
