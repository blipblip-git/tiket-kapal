import { connection, NextResponse } from 'next/server'
import { wajibSuperadmin } from '@/lib/serverAuth'
import { buatClientDemoAdmin, pesanError, statusDemo } from '@/lib/demoServer'

/**
 * Daftar penyewa di database DEMO.
 *
 * Dibaca oleh Superadmin REAL lewat server. Demo tidak punya Superadmin dan
 * tidak punya halaman Data Penyewa sendiri. Isi database demo tetap bersih:
 * kalau belum ada penyewa, hasilnya array kosong (bukan data contoh).
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

    const { data, error } = await demo
      .from('profiles')
      .select('id, nama, email, nomor_hp, nama_perusahaan, aktif, created_at, operator_id')
      .eq('role', 'admin_utama')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { error: 'Gagal membaca penyewa demo: ' + error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      penyewa: data || [],
      demoUrl: String(process.env.NEXT_PUBLIC_DEMO_URL || '').trim() || null
    })
  } catch (error: unknown) {
    console.error('Error daftar penyewa demo:', error)
    return NextResponse.json({ error: 'Server Error: ' + pesanError(error) }, { status: 500 })
  }
}
