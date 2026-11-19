import { NextResponse } from 'next/server'
import { uuidValid, wajibSuperadmin } from '@/lib/serverAuth'


// Aktifkan / nonaktifkan penyewa tanpa menghapus data apa pun.
export async function POST(request: Request) {
  try {
    const auth = await wajibSuperadmin(request)
    if (!auth.ok) return auth.response
    const { admin, profile: superadmin } = auth

    const body = await request.json()
    const { id, aktif } = body

    if (!uuidValid(id)) {
      return NextResponse.json({ error: 'ID Penyewa tidak valid' }, { status: 400 })
    }

    if (typeof aktif !== 'boolean') {
      return NextResponse.json({ error: 'Status aktif harus true/false' }, { status: 400 })
    }

    const { data: target, error: errorCari } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', id)
      .maybeSingle()

    if (errorCari) {
      return NextResponse.json({ error: 'Gagal memeriksa penyewa: ' + errorCari.message }, { status: 500 })
    }

    if (!target) {
      return NextResponse.json({ error: 'Penyewa tidak ditemukan' }, { status: 404 })
    }

    if ((target.role || '').trim().toLowerCase() === 'superadmin') {
      return NextResponse.json({ error: 'Status akun Superadmin tidak boleh diubah dari sini' }, { status: 403 })
    }

    const updateData: Record<string, unknown> = {
      aktif,
      sesi_aktif: false,
    }

    if (aktif) {
      updateData.dinonaktifkan_oleh = null
      updateData.waktu_dinonaktifkan = null
    } else {
      updateData.dinonaktifkan_oleh = superadmin.nama || 'Superadmin'
      updateData.waktu_dinonaktifkan = new Date().toISOString()
    }

    const percobaanPertama = await admin
      .from('profiles')
      .update(updateData)
      .eq('id', id)
      .select('id')

    const hasil = percobaanPertama.error &&
      /dinonaktifkan_oleh|waktu_dinonaktifkan|does not exist|column/i.test(percobaanPertama.error.message)
      ? await admin
          .from('profiles')
          .update({ aktif, sesi_aktif: false })
          .eq('id', id)
          .select('id')
      : percobaanPertama

    if (hasil.error) {
      return NextResponse.json({ error: 'Gagal mengubah status: ' + hasil.error.message }, { status: 500 })
    }

    if (!hasil.data || hasil.data.length === 0) {
      return NextResponse.json({ error: 'Status gagal diubah (0 baris berubah)' }, { status: 500 })
    }

    // SAKLAR TENANT: seluruh staf/agen di bawah penyewa ikut mengikuti status ini.
    // Data (kapal, jadwal, pesanan, laporan) TIDAK disentuh sama sekali.
    const { data: stafBerubah, error: errorStaf } = await admin
      .from('profiles')
      .update({ aktif, sesi_aktif: false })
      .eq('operator_id', id)
      .select('id')

    if (errorStaf) {
      console.error('Gagal menyamakan status staf penyewa:', errorStaf.message)
    }

    const jumlahStaf = (stafBerubah || []).length

    return NextResponse.json({
      success: true,
      message: aktif
        ? `Penyewa dan ${jumlahStaf} stafnya diaktifkan kembali. Silakan login ulang.`
        : `Penyewa dan ${jumlahStaf} stafnya dinonaktifkan (tidak bisa login). Semua data tetap tersimpan.`
    })

  } catch (error: any) {
    console.error('Error status penyewa:', error)
    return NextResponse.json({ error: 'Server Error: ' + error.message }, { status: 500 })
  }
}
