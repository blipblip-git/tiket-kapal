import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password, nama, nama_perusahaan, nomor_hp } = body

    if (!email || !password || !nama) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Konfigurasi Server belum diisi' }, { status: 500 })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
    })

    if (authError) {
      return NextResponse.json({ error: 'Auth Error: ' + authError.message }, { status: 400 })
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authData.user.id,
        email: email.trim().toLowerCase(),
        nama: nama.trim(),
        nama_perusahaan: nama_perusahaan ? nama_perusahaan.trim() : null,
        nomor_hp: nomor_hp ? nomor_hp.trim() : null,
        role: 'admin_utama',
        aktif: true,
        password_plain: password
      })

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: 'Profile Error: ' + profileError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Penyewa berhasil dibuat' })

  } catch (error: any) {
    console.error('Error tambah penyewa:', error)
    return NextResponse.json({ error: 'Server Error: ' + error.message }, { status: 500 })
  }
}