import { NextResponse } from 'next/server'
import { uuidValid, wajibSuperadmin } from '@/lib/serverAuth'


/**
 * NONAKTIFKAN penyewa (soft delete).
 *
 * Dulu endpoint ini MENGHAPUS baris profiles + auth.users. Akibatnya data milik
 * penyewa (kapal, jadwal, template jadwal, pesanan, laporan) jadi yatim karena
 * operator_id menunjuk ke akun yang sudah hilang. Sekarang akun hanya dinonaktifkan:
 * - tidak bisa login (aktif = false)
 * - semua data & form tetap utuh
 * - bisa diaktifkan kembali lewat /api/superadmin/status-penyewa
 * Superadmin & data platform tidak terpengaruh.
 */
export async function POST(request: Request) {
  try {
    const auth = await wajibSuperadmin(request)
    if (!auth.ok) return auth.response
    const { admin, profile: superadmin } = auth

    const body = await request.json()
    const { id } = body

    if (!uuidValid(id)) {
      return NextResponse.json({ error: 'ID Penyewa tidak valid' }, { status: 400 })
    }

    const { data: target, error: errorCari } = await admin
      .from('profiles')
      .select('id, nama, role')
      .eq('id', id)
      .maybeSingle()

    if (errorCari) {
      return NextResponse.json({ error: 'Gagal memeriksa penyewa: ' + errorCari.message }, { status: 500 })
    }

    if (!target) {
      return NextResponse.json({ error: 'Penyewa tidak ditemukan' }, { status: 404 })
    }

    if ((target.role || '').trim().toLowerCase() === 'superadmin') {
      return NextResponse.json({ error: 'Akun Superadmin tidak boleh dinonaktifkan dari sini' }, { status: 403 })
    }

    const updateData: Record<string, unknown> = {
      aktif: false,
      sesi_aktif: false,
      dinonaktifkan_oleh: superadmin.nama || 'Superadmin',
      waktu_dinonaktifkan: new Date().toISOString(),
    }

    const percobaanPertama = await admin
      .from('profiles')
      .update(updateData)
      .eq('id', id)
      .select('id')

    // Kalau kolom audit (dinonaktifkan_oleh/waktu_dinonaktifkan) belum ada, tetap nonaktifkan.
    const hasil = percobaanPertama.error &&
      /dinonaktifkan_oleh|waktu_dinonaktifkan|does not exist|column/i.test(percobaanPertama.error.message)
      ? await admin
          .from('profiles')
          .update({ aktif: false, sesi_aktif: false })
          .eq('id', id)
          .select('id')
      : percobaanPertama

    if (hasil.error) {
      return NextResponse.json({ error: 'Gagal menonaktifkan penyewa: ' + hasil.error.message }, { status: 500 })
    }

    if (!hasil.data || hasil.data.length === 0) {
      return NextResponse.json({ error: 'Penyewa gagal dinonaktifkan (0 baris berubah)' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Akses login penyewa dinonaktifkan. Data kapal, jadwal, dan laporan tetap tersimpan.'
    })

  } catch (error: any) {
    console.error('Error nonaktifkan penyewa:', error)
    return NextResponse.json({ error: 'Server Error: ' + error.message }, { status: 500 })
  }
}
