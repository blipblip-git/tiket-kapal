import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: 'ID Penyewa tidak ditemukan' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Konfigurasi Server belum diisi' }, { status: 500 })
    }

    // Inisialisasi Supabase Admin
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // 1. Hapus dari tabel profiles dulu
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', id)

    if (profileError) {
      return NextResponse.json({ error: 'Gagal hapus profil: ' + profileError.message }, { status: 500 })
    }

    // 2. Hapus dari tabel auth.users (Supabase Auth)
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id)

    if (authError) {
      return NextResponse.json({ error: 'Gagal hapus akun Auth: ' + authError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Penyewa berhasil dihapus' })

  } catch (error: any) {
    console.error('Error hapus penyewa:', error)
    return NextResponse.json({ error: 'Server Error: ' + error.message }, { status: 500 })
  }
}