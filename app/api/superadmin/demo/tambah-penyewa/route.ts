import { NextResponse } from 'next/server'
import { wajibSuperadmin } from '@/lib/serverAuth'
import { buatClientDemoAdmin, pesanError, statusDemo } from '@/lib/demoServer'
import { hashPasswordServer, kolomPasswordHashBelumAda } from '@/lib/passwordServer'
import { normalisasiNomorHp, nomorHpValid } from '@/lib/nomorHp'
import { cariPemilikNomorHp, pesanNomorHpTerpakai } from '@/lib/validasiNomorHpServer'

/**
 * Buat penyewa (pemilik kapal) di database DEMO, dipanggil dari halaman
 * Superadmin REAL -> Data Penyewa -> Daftar Penyewa Demo.
 *
 * Demo tidak punya Superadmin sendiri, jadi akun pemilik kapal dibuat di sini
 * memakai service role key demo di server. Browser tidak pernah memegang key
 * itu; hasil akhirnya pemilik bisa login di /login pada deployment demo.
 */
export async function POST(request: Request) {
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

    const body = await request.json()
    const { email, password, nama, nama_perusahaan, nomor_hp } = body

    if (!email || !password || !nama) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 })
    }

    const emailBersih = String(email).trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailBersih)) {
      return NextResponse.json({ error: 'Format email tidak valid' }, { status: 400 })
    }

    if (String(password).length < 6) {
      return NextResponse.json({ error: 'Password minimal 6 karakter' }, { status: 400 })
    }

    // Sama seperti tambah penyewa REAL: satu nomor HP = satu login.
    const nomorHpBersih = nomor_hp ? normalisasiNomorHp(nomor_hp) : null
    if (nomor_hp && !nomorHpValid(nomor_hp)) {
      return NextResponse.json({
        error: 'Nomor HP tidak valid. Gunakan format 08xxxxxxxxxx.'
      }, { status: 400 })
    }

    if (nomorHpBersih) {
      // Satu nomor HP = satu login, dicek di database demo (bukan database REAL).
      const pemilik = await cariPemilikNomorHp(demo, nomorHpBersih)
      if (pemilik) {
        return NextResponse.json({
          error: pesanNomorHpTerpakai(nomorHpBersih, pemilik)
        }, { status: 409 })
      }
    }

    const { data: authData, error: authError } = await demo.auth.admin.createUser({
      email: emailBersih,
      password: String(password),
      email_confirm: true
    })

    if (authError) {
      return NextResponse.json({ error: 'Auth Error: ' + authError.message }, { status: 400 })
    }

    const profilDasar = {
      id: authData.user.id,
      email: emailBersih,
      nama: String(nama).trim(),
      nama_perusahaan: nama_perusahaan ? String(nama_perusahaan).trim() : null,
      nomor_hp: nomorHpBersih,
      role: 'admin_utama',
      aktif: true
    }

    let profileError = (await demo
      .from('profiles')
      .insert({ ...profilDasar, password_hash: hashPasswordServer(String(password)) })
    ).error

    if (profileError && kolomPasswordHashBelumAda(profileError)) {
      // Skema demo lama: tetap jalan dengan cara lama.
      profileError = (await demo
        .from('profiles')
        .insert({ ...profilDasar, password_plain: String(password) })
      ).error
    }

    if (profileError) {
      await demo.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: 'Profile Error: ' + profileError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Penyewa demo berhasil dibuat',
      penyewa: { id: authData.user.id, email: emailBersih, nama: String(nama).trim() }
    })
  } catch (error: unknown) {
    console.error('Error tambah penyewa demo:', error)
    return NextResponse.json({ error: 'Server Error: ' + pesanError(error) }, { status: 500 })
  }
}
