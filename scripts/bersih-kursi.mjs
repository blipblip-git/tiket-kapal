#!/usr/bin/env node
/**
 * Housekeeping tabel `kursi` — membuang baris kursi milik jadwal LAMA yang sudah
 * tidak dipakai siapa pun, supaya database tidak membengkak tanpa batas.
 *
 * Kenapa perlu: setiap tanggal yang dibuka (pencarian tiket / API siapkan-jadwal)
 * membuat satu baris `kursi` per nomor kursi. 100 kapal x 2 jadwal x 40 kursi =
 * 8.000 baris/hari = ~3 juta baris/tahun, dan sampai sekarang belum ada yang
 * menghapusnya. Yang tumbuh paling cepat di database bukan `pesanan`, tapi ini.
 *
 *   node scripts/bersih-kursi.mjs                       # DRY-RUN, jadwal > 180 hari
 *   node scripts/bersih-kursi.mjs --hari 365            # lihat saja, lebih tua
 *   node scripts/bersih-kursi.mjs --hari 180 --jalankan # benar-benar hapus
 *   node scripts/bersih-kursi.mjs --sebelum 2026-01-01 --jalankan
 *
 * Aturan aman (jangan diubah tanpa alasan kuat):
 *  1. Tanpa `--jalankan` TIDAK ada satu baris pun yang dihapus.
 *  2. Hanya kursi berstatus `kosong` yang dihapus.
 *  3. Kursi yang dirujuk `pesanan.kursi_id` TIDAK PERNAH dihapus, walaupun
 *     statusnya kosong — e-tiket lama masih membaca nomor kursi dari baris itu.
 *  4. Hanya jadwal dengan `tanggal` lebih tua dari batas yang disentuh; tiket
 *     yang masih berlaku tidak mungkin ikut hilang.
 *  5. Batas minimal 90 hari; lebih muda dari itu harus `--paksa` (untuk uji coba).
 *
 * Kunci dibaca dari environment (SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL),
 * kalau tidak ada baru dari .env.local. Kunci tidak pernah dicetak ke log.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const BATAS_HALAMAN = 1000; // maksimum baris per request PostgREST
const BATCH_JADWAL = 60; // jumlah id jadwal per filter `in.(...)`
const BATCH_HAPUS = 100; // jumlah id kursi per request DELETE
const HARI_MINIMAL = 90;
const BYTE_PER_KURSI = 150; // perkiraan kasar baris + index, untuk info saja

function argumen(nama, bawaan) {
  const i = process.argv.indexOf(nama);
  if (i === -1) return bawaan;
  const nilai = process.argv[i + 1];
  if (!nilai || nilai.startsWith('--')) return bawaan;
  return nilai;
}

const adaFlag = (nama) => process.argv.includes(nama);

function bacaDotEnv(teks) {
  const hasil = {};
  for (const baris of teks.split(/\r?\n/)) {
    const cocok = baris.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!cocok) continue;
    let nilai = cocok[2].trim();
    if (
      (nilai.startsWith('"') && nilai.endsWith('"')) ||
      (nilai.startsWith("'") && nilai.endsWith("'"))
    ) {
      nilai = nilai.slice(1, -1);
    }
    hasil[cocok[1]] = nilai;
  }
  return hasil;
}

async function ambilKonfigurasi() {
  let dariFile = {};
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const envPath = path.join(import.meta.dirname, '..', '.env.local');
      dariFile = bacaDotEnv(await readFile(envPath, 'utf8'));
    } catch {
      // biarkan kosong; dicek di bawah
    }
  }
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || dariFile.NEXT_PUBLIC_SUPABASE_URL || '')
    .replace(/\/+$/, '');
  const kunci = process.env.SUPABASE_SERVICE_ROLE_KEY || dariFile.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !kunci) {
    console.error(
      'GAGAL: NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY harus tersedia\n' +
        '(environment atau .env.local). Tidak ada yang dihapus.'
    );
    process.exit(2);
  }
  return { url, kunci };
}

/** Tanggal (YYYY-MM-DD) `mundur` hari ke belakang menurut WITA (UTC+8). */
function tanggalMundur(mundur) {
  const ms = Date.now() + 8 * 60 * 60 * 1000 - mundur * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Nilai untuk filter PostgREST `in.(...)`; tanda kutip supaya aman untuk uuid. */
const daftarIn = (ids) => `in.(${ids.map((id) => `"${id}"`).join(',')})`;

const potong = (arr, n) => {
  const hasil = [];
  for (let i = 0; i < arr.length; i += n) hasil.push(arr.slice(i, i + n));
  return hasil;
};

async function minta(url, kunci, jalur, opsi = {}) {
  const res = await fetch(`${url}/rest/v1/${jalur}`, {
    method: opsi.method || 'GET',
    headers: {
      apikey: kunci,
      Authorization: `Bearer ${kunci}`,
      'Accept-Profile': 'public',
      'Content-Profile': 'public',
      ...(opsi.headers || {}),
    },
    body: opsi.body,
  });
  if (!res.ok) {
    const pesan = (await res.text()).slice(0, 300);
    throw new Error(`HTTP ${res.status} ${opsi.method || 'GET'} ${jalur} — ${pesan}`);
  }
  if (opsi.method === 'DELETE') {
    const teks = await res.text();
    return teks ? JSON.parse(teks) : [];
  }
  return res.json();
}

/** Ambil semua baris (paginate), karena PostgREST memotong di 1000 baris. */
async function ambilSemua(url, kunci, tabel, select, filter, kolomUrut = 'id') {
  const hasil = [];
  let offset = 0;
  for (;;) {
    const q = new URLSearchParams({
      select,
      limit: String(BATAS_HALAMAN),
      offset: String(offset),
      order: kolomUrut,
    });
    for (const [k, v] of Object.entries(filter)) q.set(k, v);
    const baris = await minta(url, kunci, `${tabel}?${q}`);
    if (!Array.isArray(baris)) throw new Error(`respons ${tabel} bukan array`);
    hasil.push(...baris);
    if (baris.length < BATAS_HALAMAN) break;
    offset += BATAS_HALAMAN;
  }
  return hasil;
}

const angka = (n) => Number(n).toLocaleString('id-ID');
const kb = (baris) => `${(baris * BYTE_PER_KURSI) / 1024 / 1024 < 1
  ? `${Math.round((baris * BYTE_PER_KURSI) / 1024)} KB`
  : `${(((baris * BYTE_PER_KURSI) / 1024 / 1024)).toFixed(1)} MB`}`;

async function main() {
  const jalankan = adaFlag('--jalankan');
  const paksa = adaFlag('--paksa');
  const sebelum = argumen('--sebelum', '');
  const hariDiminta = Number(argumen('--hari', '180'));

  if (!Number.isFinite(hariDiminta) || hariDiminta < 1) {
    console.error('GAGAL: --hari harus angka >= 1 (contoh: --hari 180).');
    process.exit(2);
  }
  if (!paksa && hariDiminta < HARI_MINIMAL) {
    console.error(
      `GAGAL: batas minimal ${HARI_MINIMAL} hari supaya tiket yang masih mungkin ` +
        `dibutuhkan tidak ikut tersentuh. Kalau ini cuma uji coba, tambahkan --paksa.`
    );
    process.exit(2);
  }

  const batas = /^\d{4}-\d{2}-\d{2}$/.test(sebelum) ? sebelum : tanggalMundur(hariDiminta);
  const hariIni = tanggalMundur(0);
  if (batas >= hariIni) {
    console.error(`GAGAL: batas tanggal ${batas} bukan tanggal lampau (hari ini ${hariIni}).`);
    process.exit(2);
  }

  const { url, kunci } = await ambilKonfigurasi();

  console.log(`Mode       : ${jalankan ? 'HAPUS (--jalankan)' : 'DRY-RUN (tidak menghapus apa pun)'}`);
  console.log(`Jadwal lama: tanggal < ${batas} (${hariDiminta} hari ke belakang)`);
  console.log('Aturan     : hanya kursi "kosong" dan tidak dirujuk pesanan mana pun.\n');

  const jadwalLama = await ambilSemua(
    url,
    kunci,
    'jadwal',
    'id,tanggal,kapal_id',
    { tanggal: `lt.${batas}` },
    'tanggal'
  );

  if (jadwalLama.length === 0) {
    console.log('Tidak ada jadwal lama. Tidak ada yang perlu dibersihkan.');
    return;
  }

  let totalKursi = 0;
  let totalKandidat = 0;
  let totalDilindungi = 0;
  let totalDihapus = 0;
  let totalSelisih = 0;
  const perTanggal = new Map();

  for (const batch of potong(jadwalLama, BATCH_JADWAL)) {
    const ids = batch.map((j) => String(j.id));
    const filter = { jadwal_id: daftarIn(ids) };

    const kursi = await ambilSemua(url, kunci, 'kursi', 'id,status,jadwal_id', filter);
    const dipesan = await ambilSemua(
      url,
      kunci,
      'pesanan',
      'kursi_id',
      { ...filter, kursi_id: 'not.is.null' }
    );

    const dipakai = new Set(dipesan.map((p) => p.kursi_id).filter(Boolean));
    const kandidat = kursi.filter((k) => k.status === 'kosong' && !dipakai.has(k.id));
    const dilindungi = kursi.length - kandidat.length;

    totalKursi += kursi.length;
    totalKandidat += kandidat.length;
    totalDilindungi += dilindungi;

    const tanggalPerJadwal = new Map(batch.map((j) => [String(j.id), String(j.tanggal)]));
    for (const k of kandidat) {
      const tgl = tanggalPerJadwal.get(String(k.jadwal_id)) || '?';
      perTanggal.set(tgl, (perTanggal.get(tgl) || 0) + 1);
    }

    if (jalankan && kandidat.length > 0) {
      for (const bagian of potong(kandidat.map((k) => String(k.id)), BATCH_HAPUS)) {
        const terhapus = await minta(
          url,
          kunci,
          `kursi?id=${daftarIn(bagian)}`,
          {
            method: 'DELETE',
            headers: { Prefer: 'return=representation' },
          }
        );
        totalDihapus += Array.isArray(terhapus) ? terhapus.length : 0;
      }

      // Verifikasi: sisa kursi di batch ini harus = sebelum - yang terhapus.
      const sisa = await ambilSemua(url, kunci, 'kursi', 'id', filter);
      const harapan = kursi.length - kandidat.length;
      if (sisa.length !== harapan) {
        totalSelisih += Math.abs(sisa.length - harapan);
        console.warn(
          `  PERINGATAN: batch ${ids[0]}..${ids[ids.length - 1]} sisa ${sisa.length}, ` +
            `harapan ${harapan}.`
        );
      }
    }
  }

  console.log(`Jadwal lama diperiksa : ${angka(jadwalLama.length)}`);
  console.log(`Baris kursi diperiksa : ${angka(totalKursi)}`);
  console.log(`Kursi dilindungi      : ${angka(totalDilindungi)} (terisi / sudah ada pesanan)`);
  console.log(`Kursi bisa dibuang    : ${angka(totalKandidat)}  (~${kb(totalKandidat)})`);

  const teratas = [...perTanggal.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (teratas.length > 0) {
    console.log('\nTerbanyak per tanggal:');
    for (const [tgl, n] of teratas) console.log(`  ${tgl} : ${angka(n)} kursi`);
  }

  if (!jalankan) {
    console.log(
      '\nDRY-RUN selesai, tidak ada yang dihapus.\n' +
        `Untuk menjalankan: node scripts/bersih-kursi.mjs --hari ${hariDiminta} --jalankan`
    );
    return;
  }

  console.log(`\nKursi terhapus        : ${angka(totalDihapus)}`);
  if (totalDihapus !== totalKandidat) {
    console.error(
      `GAGAL: jumlah terhapus (${angka(totalDihapus)}) tidak sama dengan kandidat ` +
        `(${angka(totalKandidat)}). Periksa log di atas.`
    );
    process.exit(1);
  }
  if (totalSelisih > 0) {
    console.error(`GAGAL: verifikasi sisa baris meleset ${angka(totalSelisih)} baris.`);
    process.exit(1);
  }
  console.log('Verifikasi selesai: sisa kursi sesuai harapan.');
}

main().catch((err) => {
  console.error('GAGAL:', err.message);
  process.exit(1);
});
