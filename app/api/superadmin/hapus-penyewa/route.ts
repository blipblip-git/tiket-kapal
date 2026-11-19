import { NextResponse } from 'next/server'
import { uuidValid, wajibSuperadmin } from '@/lib/serverAuth'


/**
 * HAPUS TOTAL penyewa (hard delete).
 *
 * Semua data milik penyewa dihapus bersih lewat satu fungsi SQL atomik
 * (public.hapus_penyewa_total): kapal, jadwal, kursi, pesanan, pembayaran,
 * refund, template jadwal, master rute, pengaturan sistem, audit log, seluruh
 * staf/agen, lalu akun penyewa itu sendiri. auth.users juga dihapus di sini.
 *
 * Sebelum menghapus, sistem menyimpan catatan 4 field saja
 * (nama pemilik, nama perusahaan, email, no HP) di tabel penyewa_dihapus.
 *
 * Untuk mematikan sementara (data tetap utuh) pakai /api/superadmin/status-penyewa.
 */
export async function POST(request: Request) {
  try {
    const auth = await wajibSuperadmin(request)
    if (!auth.ok) return auth.response
    const { admin } = auth

    const body = await request.json()
    const { id, konfirmasi } = body

    if (!uuidValid(id)) {
      return NextResponse.json({ error: 'ID Penyewa tidak valid' }, { status: 400 })
    }

    const { data: target, error: errorCari } = await admin
      .from('profiles')
      .select('id, nama, email, nomor_hp, nama_perusahaan, role, operator_id')
      .eq('id', id)
      .maybeSingle()

    if (errorCari) {
      return NextResponse.json({ error: 'Gagal memeriksa penyewa: ' + errorCari.message }, { status: 500 })
    }

    if (!target) {
      return NextResponse.json({ error: 'Penyewa tidak ditemukan' }, { status: 404 })
    }

    const role = (target.role || '').trim().toLowerCase()
    if (role !== 'admin_utama' || target.operator_id) {
      return NextResponse.json({ error: 'Hanya akun Admin Utama (pemilik tenant) yang bisa dihapus di sini' }, { status: 403 })
    }

    const namaTampil = (target.nama_perusahaan || target.nama || '').trim()
    const ketikan = String(konfirmasi || '').trim()
    if (!namaTampil || ketikan.toLowerCase() !== namaTampil.toLowerCase()) {
      return NextResponse.json({
        error: `Konfirmasi tidak cocok. Ketik "${namaTampil}" untuk menghapus permanen.`
      }, { status: 400 })
    }

    // Kumpulkan staf dulu (untuk hapus auth.users setelah profil terhapus).
    const { data: staf } = await admin
      .from('profiles')
      .select('id')
      .eq('operator_id', id)

    const idStaf = (staf || []).map((s) => s.id as string)

    const { data: hasil, error: errorHapus } = await admin.rpc('hapus_penyewa_total', {
      p_id: id,
      p_nama_pemilik: target.nama || null,
      p_nama_perusahaan: target.nama_perusahaan || target.nama || null,
      p_email: target.email || null,
      p_nomor_hp: target.nomor_hp || null,
    })

    if (errorHapus) {
      const pesan = errorHapus.message || ''
      if (/hapus_penyewa_total|schema cache|does not exist|Could not find the function/i.test(pesan)) {
        return NextResponse.json({
          error: 'Fungsi hapus_penyewa_total belum ada di database. Jalankan dulu file supabase/hapus-penyewa.sql di SQL Editor Supabase.'
        }, { status: 503 })
      }
      return NextResponse.json({ error: 'Gagal menghapus penyewa: ' + pesan }, { status: 500 })
    }

    // Hapus auth.users milik penyewa + stafnya (kalau ada).
    let authDihapus = 0
    try {
      const targetIds = new Set([id, ...idStaf])
      const emailTarget = (target.email || '').toLowerCase()

      const { data: daftarUser } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const kandidat = (daftarUser?.users || []).filter((u) => {
        const email = (u.email || '').toLowerCase()
        if (email === 'superadmin@gmail.com') return false
        return targetIds.has(u.id) || (emailTarget && email === emailTarget)
      })

      for (const u of kandidat) {
        const { error } = await admin.auth.admin.deleteUser(u.id)
        if (!error) authDihapus += 1
      }

      // Profil yang dibuat manual (bukan Supabase Auth) — coba hapus id-nya juga.
      for (const stafId of targetIds) {
        if (kandidat.some((u) => u.id === stafId)) continue
        const { error } = await admin.auth.admin.deleteUser(stafId)
        if (!error) authDihapus += 1
      }
    } catch (err: any) {
      console.error('Gagal hapus auth user penyewa:', err?.message)
    }

    return NextResponse.json({
      success: true,
      message: `Penyewa ${namaTampil} dihapus permanen. Catatan (nama pemilik, perusahaan, email, no HP) tersimpan.`,
      terhapus: hasil || null,
      auth_terhapus: authDihapus,
    })
  } catch (error: any) {
    console.error('Error hapus penyewa:', error)
    return NextResponse.json({ error: 'Server Error: ' + error.message }, { status: 500 })
  }
}
