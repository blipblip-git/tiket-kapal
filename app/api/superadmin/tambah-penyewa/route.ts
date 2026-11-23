import { NextResponse } from 'next/server'
import { wajibSuperadmin } from '@/lib/serverAuth'
import { hashPasswordServer, kolomPasswordHashBelumAda } from '@/lib/passwordServer'
import { normalisasiNomorHp, nomorHpValid } from '@/lib/nomorHp'
import { cariPemilikNomorHp, pesanNomorHpTerpakai } from '@/lib/validasiNomorHpServer'


export async function POST(request: Request) {
  try {
    // WAJIB: hanya Superadmin yang login lewat /superadmin yang boleh tambah penyewa.
    const auth = await wajibSuperadmin(request)
    if (!auth.ok) return auth.response
    const { admin } = auth

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

    // Satu nomor HP = satu login, termasuk lintas penyewa.
    const nomorHpBersih = nomor_hp ? normalisasiNomorHp(nomor_hp) : null
    if (nomor_hp && !nomorHpValid(nomor_hp)) {
      return NextResponse.json({
        error: 'Nomor HP tidak valid. Gunakan format 08xxxxxxxxxx.'
      }, { status: 400 })
    }

    if (nomorHpBersih) {
      const pemilik = await cariPemilikNomorHp(admin, nomorHpBersih)
      if (pemilik) {
        return NextResponse.json({
          error: pesanNomorHpTerpakai(nomorHpBersih, pemilik)
        }, { status: 409 })
      }
    }

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: emailBersih,
      password: String(password),
      email_confirm: true,
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
      aktif: true,
    }

    // Password TIDAK disimpan sebagai teks biasa.
    let profileError = (await admin
      .from('profiles')
      .insert({ ...profilDasar, password_hash: hashPasswordServer(String(password)) })
    ).error

    if (!profileError) {
      // Best-effort: bersihkan plaintext lama kalau kolomnya masih ada.
      await admin.from('profiles').update({ password_plain: null }).eq('id', authData.user.id)
    }

    // Kalau SQL migrasi belum dijalankan, tetap jalan dengan cara lama.
    if (profileError && kolomPasswordHashBelumAda(profileError)) {
      console.warn('tambah-penyewa: kolom password_hash belum ada, fallback sementara ke password_plain')
      profileError = (await admin
        .from('profiles')
        .insert({ ...profilDasar, password_plain: String(password) })
      ).error
    }

    if (profileError) {
      await admin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: 'Profile Error: ' + profileError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Penyewa berhasil dibuat' })

  } catch (error: any) {
    console.error('Error tambah penyewa:', error)
    return NextResponse.json({ error: 'Server Error: ' + error.message }, { status: 500 })
  }
}
