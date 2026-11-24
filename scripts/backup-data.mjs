#!/usr/bin/env node
/**
 * Backup DATA Supabase lewat REST (PostgREST) — tidak butuh pg_dump/psql.
 *
 * Hasil: satu folder per backup berisi <tabel>.ndjson.gz + manifest.json.
 *
 *   node scripts/backup-data.mjs                 # simpan ke ~/backup-tiket-kapal
 *   node scripts/backup-data.mjs --out /path     # folder lain
 *   node scripts/backup-data.mjs --keep 30       # simpan 30 backup terakhir
 *
 * Kunci dibaca dari environment (SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL),
 * kalau tidak ada baru dibaca dari .env.local. Kunci TIDAK pernah dicetak ke log.
 *
 * Batasan yang harus diketahui:
 * - Ini backup ISI TABEL (public schema), bukan skema. Skema ada di supabase/*.sql.
 * - `auth.users` tidak bisa diambil lewat REST; akun login Supabase Auth tidak ikut.
 * - Untuk dump penuh (skema + data) pasang postgresql-client lalu isi SUPABASE_DB_URL:
 *   lihat scripts/backup-db.sh dan docs/BACKUP.md.
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, readdir, rm, stat, chmod } from 'node:fs/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import os from 'node:os';

const BATAS_HALAMAN = 1000; // maksimum baris per request PostgREST
const BATAS_MAKS_BARIS = 500000; // pengaman kalau paginasi tidak pernah berhenti
const NAMA_TABEL_VALID = /^[a-z_][a-z0-9_]*$/;

// Dipakai kalau OpenAPI PostgREST tidak bisa dibaca (mis. project sedang pause).
const TABEL_CADANGAN = [
  'profiles', 'kapal', 'template_jadwal', 'jadwal', 'kursi', 'kursi_pakai',
  'pesanan', 'pembayaran', 'master_kota', 'master_rute', 'pengaturan_teks',
  'pengaturan_sistem', 'pengaturan_platform', 'audit_log', 'api_klien',
  'refund', 'penyewa_dihapus',
];

function argumen(nama, bawaan) {
  const i = process.argv.indexOf(nama);
  if (i === -1 || i === process.argv.length - 1) return bawaan;
  return process.argv[i + 1];
}

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
        '(environment atau .env.local). Backup tidak dijalankan.'
    );
    process.exit(2);
  }
  return { url, kunci };
}

async function ambilDaftarTabel(url, kunci) {
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: kunci, Authorization: `Bearer ${kunci}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const spec = await res.json();
    const defs = spec?.definitions ?? {};
    const tabel = Object.keys(defs).filter((nama) => NAMA_TABEL_VALID.test(nama));
    if (tabel.length === 0) throw new Error('definitions kosong');
    const urut = {};
    for (const nama of tabel) {
      const kolom = defs[nama]?.properties ?? {};
      if (kolom.id) urut[nama] = 'id';
      else if (kolom.created_at) urut[nama] = 'created_at';
      else urut[nama] = null;
    }
    return { tabel: tabel.sort(), urut, sumber: 'openapi' };
  } catch (err) {
    console.warn(
      `PERINGATAN: daftar tabel dari OpenAPI gagal (${err.message}); pakai daftar cadangan.`
    );
    return {
      tabel: [...TABEL_CADANGAN],
      urut: Object.fromEntries(TABEL_CADANGAN.map((t) => [t, 'id'])),
      sumber: 'cadangan',
    };
  }
}

async function ambilSemuaBaris(url, kunci, tabel, kolomUrut, tulisBaris) {
  let offset = 0;
  let jumlah = 0;
  for (;;) {
    const q = new URLSearchParams({
      select: '*',
      limit: String(BATAS_HALAMAN),
      offset: String(offset),
    });
    if (kolomUrut) q.set('order', kolomUrut);
    const res = await fetch(`${url}/rest/v1/${tabel}?${q}`, {
      headers: {
        apikey: kunci,
        Authorization: `Bearer ${kunci}`,
        'Accept-Profile': 'public',
      },
    });
    if (!res.ok) {
      const pesan = (await res.text()).slice(0, 300);
      throw new Error(`HTTP ${res.status} — ${pesan}`);
    }
    const baris = await res.json();
    if (!Array.isArray(baris)) throw new Error('respons bukan array');
    for (const b of baris) tulisBaris(JSON.stringify(b) + '\n');
    jumlah += baris.length;
    if (baris.length < BATAS_HALAMAN) break;
    offset += BATAS_HALAMAN;
    if (offset >= BATAS_MAKS_BARIS) throw new Error(`melewati batas ${BATAS_MAKS_BARIS} baris`);
  }
  return jumlah;
}

async function buangBackupLama(out, simpan) {
  const isi = await readdir(out, { withFileTypes: true });
  const folder = isi
    .filter((e) => e.isDirectory() && /^db-\d{8}-\d{6}$/.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
  const dibuang = [];
  for (const nama of folder.slice(simpan)) {
    await rm(path.join(out, nama), { recursive: true, force: true });
    dibuang.push(nama);
  }
  return dibuang;
}

// Backup tanpa verifikasi = harapan, bukan bukti. Hitung ulang baris dari file .gz
// yang sudah ditulis; kalau tidak sama dengan jumlah yang diterima dari API, tabel
// itu ditandai GAGAL (lebih baik tahu sekarang daripada saat mau restore).
async function hitungBarisGz(berkas) {
  let jumlah = 0;
  for await (const potongan of createReadStream(berkas).pipe(createGunzip())) {
    for (let i = 0; i < potongan.length; i += 1) {
      if (potongan[i] === 10) jumlah += 1;
    }
  }
  return jumlah;
}

async function ukuranFolder(dir) {
  let total = 0;
  for (const nama of await readdir(dir)) {
    const s = await stat(path.join(dir, nama));
    total += s.size;
  }
  return total;
}

async function main() {
  const out = path.resolve(argumen('--out', path.join(os.homedir(), 'backup-tiket-kapal')));
  const simpanDiminta = Number(argumen('--keep', '14'));
  const simpan = Number.isFinite(simpanDiminta) && simpanDiminta > 0 ? simpanDiminta : 14;
  const { url, kunci } = await ambilKonfigurasi();

  const stempel = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const tujuan = path.join(out, `db-${stempel}`);
  // 0700: hanya user ini yang bisa masuk folder backup.
  await mkdir(tujuan, { recursive: true, mode: 0o700 });

  const { tabel, urut, sumber } = await ambilDaftarTabel(url, kunci);
  console.log(`Backup ke ${tujuan}`);
  console.log(`Daftar tabel dari ${sumber} (${tabel.length} tabel)\n`);

  const manifest = {
    waktu: new Date().toISOString(),
    project: url.replace(/^https?:\/\//, ''),
    metode: 'rest-postgrest',
    sumber_daftar_tabel: sumber,
    tabel: {},
  };
  let gagal = 0;

  for (const nama of tabel) {
    const berkas = path.join(tujuan, `${nama}.ndjson.gz`);
    const gz = createGzip({ level: 9 });
    // 0600: backup memuat NIK, nomor HP, dan hash password.
    const keluar = createWriteStream(berkas, { mode: 0o600 });
    const pipa = pipeline(gz, keluar);
    try {
      const jumlah = await ambilSemuaBaris(url, kunci, nama, urut[nama], (baris) => gz.write(baris));
      gz.end();
      await pipa;
      const dicek = await hitungBarisGz(berkas);
      if (dicek !== jumlah) {
        throw new Error(`isi file ${dicek} baris, seharusnya ${jumlah} — file tidak dipercaya`);
      }
      await chmod(berkas, 0o600);
      manifest.tabel[nama] = { baris: jumlah, dicek, file: path.basename(berkas) };
      console.log(`  ${nama.padEnd(22)} ${String(jumlah).padStart(6)} baris  (terverifikasi)`);
    } catch (err) {
      gagal += 1;
      gz.destroy();
      keluar.destroy();
      await rm(berkas, { force: true });
      manifest.tabel[nama] = { baris: 0, galat: err.message };
      console.error(`  ${nama.padEnd(22)} GAGAL — ${err.message}`);
    }
  }

  await writeFile(path.join(tujuan, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const dibuang = await buangBackupLama(out, simpan);
  const ukuran = await ukuranFolder(tujuan);
  const totalBaris = Object.values(manifest.tabel).reduce((a, t) => a + (t.baris || 0), 0);

  console.log(
    `\nSelesai: ${tabel.length - gagal}/${tabel.length} tabel, ${totalBaris} baris, ` +
      `${(ukuran / 1024 / 1024).toFixed(2)} MB`
  );
  if (dibuang.length) console.log(`Backup lama dihapus: ${dibuang.join(', ')}`);
  if (gagal) {
    console.error(`ADA ${gagal} TABEL GAGAL — cek manifest.json`);
    process.exit(1);
  }
}

await main();

