#!/usr/bin/env node
/**
 * Verifikasi database DEMO masih bersih (tanpa data operasional).
 *
 *   node scripts/verify-demo-clean.mjs
 *
 * Membaca env dari process.env, lalu fallback ke .env.local:
 *   DEMO_SUPABASE_URL
 *   DEMO_SUPABASE_SERVICE_ROLE_KEY
 *
 * Script ini TIDAK menulis/menghapus apa pun. Hanya menghitung baris lewat REST.
 * Gagal (exit 1) kalau ada kapal/jadwal/kursi/pesanan/pembayaran/audit/refund,
 * akun Superadmin, atau file storage di demo.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const OPERASIONAL = [
  'kapal',
  'template_jadwal',
  'jadwal',
  'kursi',
  'kursi_pakai',
  'pesanan',
  'pembayaran',
  'refund',
  'audit_log',
  'api_klien',
  'penyewa_dihapus'
]

const BOLEH_ADA = [
  'profiles',
  'master_kota',
  'master_rute',
  'pengaturan_teks',
  'pengaturan_sistem',
  'pengaturan_platform'
]

const BATAS_WAKTU = 15000

function rapikanUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '')
}

function bacaDotEnv(teks) {
  const hasil = {}
  for (const baris of teks.split(/\r?\n/)) {
    const cocok = baris.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!cocok) continue
    let nilai = cocok[2].trim()
    if (
      (nilai.startsWith('"') && nilai.endsWith('"')) ||
      (nilai.startsWith("'") && nilai.endsWith("'"))
    ) {
      nilai = nilai.slice(1, -1)
    }
    hasil[cocok[1]] = nilai
  }
  return hasil
}

async function ambilKonfigurasi() {
  let dariFile = {}
  if (!process.env.DEMO_SUPABASE_URL || !process.env.DEMO_SUPABASE_SERVICE_ROLE_KEY) {
    try {
      dariFile = bacaDotEnv(
        await readFile(path.join(import.meta.dirname, '..', '.env.local'), 'utf8')
      )
    } catch {
      // dibiarkan kosong; dicek di bawah
    }
  }

  const urlDemo = rapikanUrl(
    process.env.DEMO_SUPABASE_URL || dariFile.DEMO_SUPABASE_URL
  )
  const keyDemo = String(
    process.env.DEMO_SUPABASE_SERVICE_ROLE_KEY ||
      dariFile.DEMO_SUPABASE_SERVICE_ROLE_KEY ||
      ''
  ).trim()
  const urlReal = rapikanUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL || dariFile.NEXT_PUBLIC_SUPABASE_URL
  )
  const keyReal = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY || dariFile.SUPABASE_SERVICE_ROLE_KEY || ''
  ).trim()

  if (!urlDemo || !keyDemo) {
    console.error(
      'GAGAL: DEMO_SUPABASE_URL dan DEMO_SUPABASE_SERVICE_ROLE_KEY harus tersedia.\n' +
        'Isi environment atau .env.local. Script tidak dijalankan.'
    )
    process.exit(2)
  }

  if (urlReal && urlDemo === urlReal) {
    console.error(
      'GAGAL: DEMO_SUPABASE_URL sama dengan NEXT_PUBLIC_SUPABASE_URL (database real).\n' +
        'Demo wajib memakai project Supabase terpisah.'
    )
    process.exit(2)
  }

  if (keyReal && keyDemo === keyReal) {
    console.error(
      'GAGAL: DEMO_SUPABASE_SERVICE_ROLE_KEY sama dengan SUPABASE_SERVICE_ROLE_KEY real.\n' +
        'Demo wajib memakai project Supabase terpisah.'
    )
    process.exit(2)
  }

  return { urlDemo, keyDemo }
}

function header(key, tambahan = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Accept-Profile': 'public',
    ...tambahan
  }
}

async function hitung(url, key, tabel, filter = '') {
  const alamat = `${url}/rest/v1/${tabel}?select=*&limit=1${filter}`
  const res = await fetch(alamat, {
    headers: header(key, { Prefer: 'count=exact', Range: '0-0' }),
    signal: AbortSignal.timeout(BATAS_WAKTU)
  })

  if (res.status === 404) return { ada: false, jumlah: null }
  if (!res.ok) {
    throw new Error(`${tabel}: HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`)
  }

  const range = res.headers.get('content-range') || ''
  const angka = Number(range.split('/').pop())
  return { ada: true, jumlah: Number.isFinite(angka) ? angka : null }
}

async function daftarSuperadmin(url, key) {
  const res = await fetch(`${url}/rest/v1/profiles?select=email&role=eq.superadmin`, {
    headers: header(key),
    signal: AbortSignal.timeout(BATAS_WAKTU)
  })

  if (res.status === 404) return []
  if (!res.ok) throw new Error(`profiles: HTTP ${res.status}`)

  const data = await res.json()
  return (Array.isArray(data) ? data : []).map((p) => String(p.email || '(tanpa email)'))
}

async function cekStorage(url, key) {
  const res = await fetch(`${url}/storage/v1/bucket`, {
    headers: header(key),
    signal: AbortSignal.timeout(BATAS_WAKTU)
  })

  if (res.status === 404) return { tersedia: false, bucket: [], adaIsi: [] }
  if (!res.ok) throw new Error(`storage: HTTP ${res.status}`)

  const daftar = await res.json()
  const bucket = Array.isArray(daftar) ? daftar : []
  const adaIsi = []

  for (const b of bucket) {
    const nama = String(b?.name || b?.id || '').trim()
    if (!nama) continue

    const list = await fetch(`${url}/storage/v1/object/list/${encodeURIComponent(nama)}`, {
      method: 'POST',
      headers: header(key, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefix: '', limit: 1, offset: 0 }),
      signal: AbortSignal.timeout(BATAS_WAKTU)
    })

    if (!list.ok) continue
    const isi = await list.json()
    if (Array.isArray(isi) && isi.length > 0) adaIsi.push(nama)
  }

  return { tersedia: true, bucket: bucket.map((b) => b?.name || b?.id).filter(Boolean), adaIsi }
}

async function main() {
  const { urlDemo, keyDemo } = await ambilKonfigurasi()
  let gagal = false

  console.log(`Database demo: ${urlDemo}`)
  console.log('Mode: HANYA BACA (tidak ada insert/update/delete)\n')

  console.log('--- Tabel operasional (wajib 0) ---')
  for (const tabel of OPERASIONAL) {
    try {
      const { ada, jumlah } = await hitung(urlDemo, keyDemo, tabel)
      if (!ada) {
        // Tabel yang belum ada tidak bisa menyimpan data operasional, jadi tidak
        // menggagalkan pemeriksaan. Ini bukan "lupa migrasi" yang diam-diam:
        // kelengkapan skema diverifikasi terpisah (bandingkan dengan REAL).
        console.log(`  ${tabel.padEnd(20)} TIDAK ADA (dianggap bersih)`)
        continue
      }
      console.log(`  ${tabel.padEnd(20)} ${jumlah}`)
      if (jumlah !== 0) gagal = true
    } catch (err) {
      console.log(`  ${tabel.padEnd(20)} GAGAL: ${err.message}`)
      gagal = true
    }
  }

  // Pintu Superadmin demo memang bisa dibuka (DEMO_SUPERADMIN=true) supaya
  // pemilik bisa membuat beberapa akun penyewa. Yang dilarang: akun superadmin
  // lain di luar akun khusus demo ini.
  const SUPERADMIN_DIIZINKAN = ['superadmin@lintasair.com']

  console.log('\n--- Akun Superadmin demo (hanya akun khusus demo) ---')
  try {
    const daftar = await daftarSuperadmin(urlDemo, keyDemo)
    const asing = daftar.filter(
      (email) => !SUPERADMIN_DIIZINKAN.includes(email.toLowerCase())
    )
    console.log(`  superadmin           ${daftar.length} (diizinkan: ${SUPERADMIN_DIIZINKAN.join(', ')})`)
    if (asing.length > 0) {
      console.log(`  TIDAK DIIZINKAN       ${asing.join(', ')}`)
      gagal = true
    }
  } catch (err) {
    console.log(`  superadmin           GAGAL: ${err.message}`)
    gagal = true
  }

  console.log('\n--- Tabel referensi/pengaturan (boleh ada) ---')
  for (const tabel of BOLEH_ADA) {
    try {
      const { ada, jumlah } = await hitung(urlDemo, keyDemo, tabel)
      console.log(`  ${tabel.padEnd(20)} ${ada ? jumlah : 'TIDAK ADA'}`)
    } catch (err) {
      console.log(`  ${tabel.padEnd(20)} GAGAL: ${err.message}`)
    }
  }

  console.log('\n--- Storage (bucket boleh ada, isi harus kosong) ---')
  try {
    const storage = await cekStorage(urlDemo, keyDemo)
    if (!storage.tersedia) {
      console.log('  Storage API tidak tersedia / belum dibuat.')
    } else {
      console.log(`  Bucket: ${storage.bucket.length === 0 ? '(kosong)' : storage.bucket.join(', ')}`)
      if (storage.adaIsi.length > 0) {
        console.log(`  BERISI FILE: ${storage.adaIsi.join(', ')}`)
        gagal = true
      } else {
        console.log('  Isi file: kosong')
      }
    }
  } catch (err) {
    console.log(`  Storage gagal diperiksa: ${err.message}`)
  }

  console.log('\n' + (gagal ? 'HASIL: TIDAK BERSIH — demo masih punya data operasional/akun terlarang.' : 'HASIL: BERSIH — tidak ada data operasional di demo.'))
  process.exit(gagal ? 1 : 0)
}

main().catch((err) => {
  console.error('GAGAL:', err.message)
  process.exit(2)
})
