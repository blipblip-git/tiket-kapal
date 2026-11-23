// app/api/admin/validasi-nomor-hp/route.ts
// Cek nomor HP sebelum Admin membuat/mengubah akun.
// Satu nomor HP hanya boleh dipakai satu akun login.

import { NextResponse } from 'next/server'
import { uuidValid, wajibAdmin } from '@/lib/serverAuth'
import { normalisasiNomorHp, nomorHpValid } from '@/lib/nomorHp'
import { cariPemilikNomorHp, pesanNomorHpTerpakai } from '@/lib/validasiNomorHpServer'

export async function POST(request: Request) {
  const auth = await wajibAdmin(request)
  if (!auth.ok) return auth.response
  const { admin } = auth

  let body: { nomor_hp?: unknown; kecuali_id?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Format permintaan tidak valid.' }, { status: 400 })
  }

  const nomorHp = String(body.nomor_hp ?? '').trim()
  const kecualiId = String(body.kecuali_id ?? '').trim()

  if (!nomorHpValid(nomorHp)) {
    return NextResponse.json({
      error: 'Nomor HP tidak valid. Gunakan format 08xxxxxxxxxx.'
    }, { status: 400 })
  }

  if (kecualiId && !uuidValid(kecualiId)) {
    return NextResponse.json({ error: 'ID akun yang dikecualikan tidak valid.' }, { status: 400 })
  }

  try {
    const pemilik = await cariPemilikNomorHp(admin, nomorHp, kecualiId || null)
    if (pemilik) {
      return NextResponse.json({ error: pesanNomorHpTerpakai(nomorHp, pemilik) }, { status: 409 })
    }

    return NextResponse.json({
      success: true,
      nomor_hp: normalisasiNomorHp(nomorHp)
    })
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Gagal memeriksa nomor HP.'
    }, { status: 500 })
  }
}
