import { NextResponse } from 'next/server'
import { uuidValid, wajibSuperadmin } from '@/lib/serverAuth'
import { buatClientDemoAdmin, pesanError, statusDemo } from '@/lib/demoServer'
import { hashPasswordServer, kolomPasswordHashBelumAda } from '@/lib/passwordServer'
import { normalisasiNomorHp, nomorHpValid } from '@/lib/nomorHp'
import { cariPemilikNomorHp, pesanNomorHpTerpakai } from '@/lib/validasiNomorHpServer'

/**
 * EDIT & HAPUS satu penyewa (pemilik kapal) di database DEMO.
 *
 * Dipanggil dari halaman Superadmin REAL -> Data Penyewa -> Daftar Penyewa Demo.
 * Demo tidak punya Superadmin, jadi pengelolaan akun demo dilakukan dari REAL
 * memakai service role key demo di server (browser tidak pernah memegang key).
 *
 * PATCH  : ubah nama / perusahaan / nomor HP / email login / password / status.
 * DELETE : hapus permanen akun demo + seluruh data miliknya di database demo.
 *          Wajib mengetik nama perusahaan (atau nama pemilik) sebagai konfirmasi,
 *          sama seperti hapus penyewa di REAL.
 */

type KonteksRute = { params: Promise<{ id: string }> }

type ProfilDemo = {
  id: string
  email: string | null
  nama: string | null
  nama_perusahaan: string | null
  nomor_hp: string | null
  role: string | null
  operator_id: string | null
  aktif: boolean | null
}

const POLA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function PATCH(request: Request, konteks: KonteksRute) {
  try {
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

    const { id } = await konteks.params
    if (!uuidValid(id)) {
      return NextResponse.json({ error: 'ID penyewa demo tidak valid' }, { status: 400 })
    }

    const body = await request.json()
    const { nama, nama_perusahaan, nomor_hp, email, password, aktif } = body

    const { data: targetData, error: errorCari } = await demo
      .from('profiles')
      .select('id, email, nama, nama_perusahaan, nomor_hp, role, operator_id, aktif')
      .eq('id', id)
      .maybeSingle()

    if (errorCari) {
      return NextResponse.json({ error: 'Gagal memeriksa penyewa demo: ' + errorCari.message }, { status: 500 })
    }

    const target = (targetData || null) as ProfilDemo | null
    if (!target) {
      return NextResponse.json({ error: 'Penyewa demo tidak ditemukan' }, { status: 404 })
    }

    const role = (target.role || '').trim().toLowerCase()
    if (role !== 'admin_utama' || target.operator_id) {
      return NextResponse.json({
        error: 'Hanya akun pemilik (Admin Utama) demo yang boleh diubah dari halaman ini.'
      }, { status: 403 })
    }

    // --- Validasi isian -------------------------------------------------
    const namaBersih = String(nama ?? '').trim()
    if (!namaBersih) {
      return NextResponse.json({ error: 'Nama pemilik tidak boleh kosong' }, { status: 400 })
    }

    const perusahaanBersih = nama_perusahaan === undefined
      ? target.nama_perusahaan
      : (String(nama_perusahaan).trim() || null)

    let nomorHpBersih = target.nomor_hp
    if (nomor_hp !== undefined) {
      const teksHp = String(nomor_hp ?? '').trim()
      if (teksHp && !nomorHpValid(teksHp)) {
        return NextResponse.json({
          error: 'Nomor HP tidak valid. Gunakan format 08xxxxxxxxxx.'
        }, { status: 400 })
      }
      nomorHpBersih = teksHp ? normalisasiNomorHp(teksHp) : null

      if (nomorHpBersih) {
        // Satu nomor HP = satu login, dicek di database demo (kecuali akun ini sendiri).
        const pemilik = await cariPemilikNomorHp(demo, nomorHpBersih, id)
        if (pemilik) {
          return NextResponse.json({
            error: pesanNomorHpTerpakai(nomorHpBersih, pemilik)
          }, { status: 409 })
        }
      }
    }

    const emailLama = String(target.email || '').trim().toLowerCase()
    const emailBaru = email === undefined ? emailLama : String(email).trim().toLowerCase()
    if (!emailBaru || !POLA_EMAIL.test(emailBaru)) {
      return NextResponse.json({ error: 'Format email tidak valid' }, { status: 400 })
    }
    const emailBerubah = emailBaru !== emailLama

    const passwordBaru = password === undefined || password === null ? '' : String(password)
    if (passwordBaru && passwordBaru.length < 6) {
      return NextResponse.json({ error: 'Password minimal 6 karakter' }, { status: 400 })
    }

    const aktifBaru = typeof aktif === 'boolean' ? aktif : Boolean(target.aktif)
    const statusBerubah = aktifBaru !== Boolean(target.aktif)

    // --- 1) Ubah login (email/password) dulu ----------------------------
    // Kalau email sudah dipakai akun lain, Supabase menolak di sini sehingga
    // data profil belum tersentuh sama sekali.
    if (emailBerubah || passwordBaru) {
      const { error: authError } = await demo.auth.admin.updateUserById(id, {
        ...(emailBerubah ? { email: emailBaru, email_confirm: true } : {}),
        ...(passwordBaru ? { password: passwordBaru } : {})
      })

      if (authError) {
        return NextResponse.json({ error: 'Auth Error: ' + authError.message }, { status: 400 })
      }
    }

    // --- 2) Ubah profil -------------------------------------------------
    const perubahan: Record<string, unknown> = {
      nama: namaBersih,
      nama_perusahaan: perusahaanBersih,
      nomor_hp: nomorHpBersih,
      email: emailBaru,
      aktif: aktifBaru
    }

    if (statusBerubah) {
      perubahan.sesi_aktif = null
      if (aktifBaru) {
        perubahan.dinonaktifkan_oleh = null
        perubahan.waktu_dinonaktifkan = null
      } else {
        perubahan.dinonaktifkan_oleh = auth.profile.nama || 'Superadmin'
        perubahan.waktu_dinonaktifkan = new Date().toISOString()
      }
    }

    if (passwordBaru) {
      perubahan.password_hash = hashPasswordServer(passwordBaru)
    }

    let profileError = (await demo.from('profiles').update(perubahan).eq('id', id)).error

    if (profileError && passwordBaru && kolomPasswordHashBelumAda(profileError)) {
      // Skema demo lama: simpan password apa adanya (kolom password_hash belum ada).
      const tanpaHash = { ...perubahan }
      delete tanpaHash.password_hash
      profileError = (await demo
        .from('profiles')
        .update({ ...tanpaHash, password_plain: passwordBaru })
        .eq('id', id)
      ).error
    }

    if (
      profileError && statusBerubah &&
      /sesi_aktif|dinonaktifkan_oleh|waktu_dinonaktifkan|column|does not exist|schema cache/i.test(profileError.message)
    ) {
      const tanpaKolomStatus = { ...perubahan }
      delete tanpaKolomStatus.sesi_aktif
      delete tanpaKolomStatus.dinonaktifkan_oleh
      delete tanpaKolomStatus.waktu_dinonaktifkan
      profileError = (await demo.from('profiles').update(tanpaKolomStatus).eq('id', id)).error
    }

    if (profileError) {
      // Kembalikan email login kalau profil gagal disimpan.
      if (emailBerubah) {
        await demo.auth.admin.updateUserById(id, { email: emailLama, email_confirm: true })
      }
      return NextResponse.json({ error: 'Profile Error: ' + profileError.message }, { status: 500 })
    }

    // Saklar tenant: staf/petugas demo di bawah pemilik ikut status pemilik.
    if (statusBerubah) {
      const { error: errorStaf } = await demo
        .from('profiles')
        .update({ aktif: aktifBaru, sesi_aktif: null })
        .eq('operator_id', id)

      if (errorStaf) {
        console.error('Gagal menyamakan status staf demo:', errorStaf.message)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Data penyewa demo diperbarui',
      passwordDiubah: Boolean(passwordBaru),
      penyewa: {
        id,
        nama: namaBersih,
        nama_perusahaan: perusahaanBersih,
        email: emailBaru,
        nomor_hp: nomorHpBersih,
        aktif: aktifBaru
      }
    })
  } catch (error: unknown) {
    console.error('Error ubah penyewa demo:', error)
    return NextResponse.json({ error: 'Server Error: ' + pesanError(error) }, { status: 500 })
  }
}

export async function DELETE(request: Request, konteks: KonteksRute) {
  try {
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

    const { id } = await konteks.params
    if (!uuidValid(id)) {
      return NextResponse.json({ error: 'ID penyewa demo tidak valid' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const konfirmasi = String(body?.konfirmasi || '').trim()

    const { data: targetData, error: errorCari } = await demo
      .from('profiles')
      .select('id, email, nama, nama_perusahaan, nomor_hp, role, operator_id')
      .eq('id', id)
      .maybeSingle()

    if (errorCari) {
      return NextResponse.json({ error: 'Gagal memeriksa penyewa demo: ' + errorCari.message }, { status: 500 })
    }

    const target = (targetData || null) as ProfilDemo | null
    if (!target) {
      return NextResponse.json({ error: 'Penyewa demo tidak ditemukan' }, { status: 404 })
    }

    const role = (target.role || '').trim().toLowerCase()
    if (role !== 'admin_utama' || target.operator_id) {
      return NextResponse.json({
        error: 'Hanya akun pemilik (Admin Utama) demo yang boleh dihapus dari halaman ini.'
      }, { status: 403 })
    }

    const namaTampil = String(target.nama_perusahaan || target.nama || '').trim()
    if (!namaTampil || konfirmasi.toLowerCase() !== namaTampil.toLowerCase()) {
      return NextResponse.json({
        error: `Konfirmasi tidak cocok. Ketik "${namaTampil}" untuk menghapus.`
      }, { status: 400 })
    }

    // Staf/petugas demo di bawah pemilik ini (ikut dihapus).
    const { data: staf } = await demo
      .from('profiles')
      .select('id')
      .eq('operator_id', id)

    const idStaf = ((staf || []) as { id: string }[]).map((s) => s.id)

    // Satu fungsi SQL yang sama dengan hapus penyewa REAL: kapal, jadwal, kursi,
    // pesanan, pembayaran, refund, template, master rute, pengaturan, audit log,
    // staf, lalu profil pemilik. Atomik, jadi tidak ada data yatim di demo.
    const { data: hasil, error: errorHapus } = await demo.rpc('hapus_penyewa_total', {
      p_id: id,
      p_nama_pemilik: target.nama || null,
      p_nama_perusahaan: target.nama_perusahaan || target.nama || null,
      p_email: target.email || null,
      p_nomor_hp: target.nomor_hp || null
    })

    if (errorHapus) {
      const pesan = errorHapus.message || ''
      if (/hapus_penyewa_total|schema cache|does not exist|Could not find the function/i.test(pesan)) {
        return NextResponse.json({
          error: 'Fungsi hapus_penyewa_total belum ada di database demo. Jalankan dulu file supabase/hapus-penyewa.sql di SQL Editor Supabase demo.'
        }, { status: 503 })
      }
      return NextResponse.json({ error: 'Gagal menghapus penyewa demo: ' + pesan }, { status: 500 })
    }

    // Demo tidak menyimpan jejak penghapusan: catatan 4 kolom yang ditulis
    // fungsi SQL di atas dibersihkan lagi supaya database demo tetap bersih
    // (scripts/verify-demo-clean.mjs mewajibkan penyewa_dihapus = 0).
    if (target.email) {
      const { error: errorCatatan } = await demo
        .from('penyewa_dihapus')
        .delete()
        .eq('email', target.email)
      if (errorCatatan) {
        console.error('Gagal membersihkan catatan hapus demo:', errorCatatan.message)
      }
    }

    // Hapus akun login demo (pemilik + stafnya).
    let authDihapus = 0
    for (const uid of [id, ...idStaf]) {
      const { error } = await demo.auth.admin.deleteUser(uid)
      if (error) {
        if (!/not found|does not exist/i.test(error.message || '')) {
          console.error('Gagal hapus auth demo ' + uid + ':', error.message)
        }
        continue
      }
      authDihapus += 1
    }

    return NextResponse.json({
      success: true,
      message: `Penyewa demo ${namaTampil} dihapus permanen dari database demo.`,
      terhapus: hasil || null,
      auth_terhapus: authDihapus
    })
  } catch (error: unknown) {
    console.error('Error hapus penyewa demo:', error)
    return NextResponse.json({ error: 'Server Error: ' + pesanError(error) }, { status: 500 })
  }
}
