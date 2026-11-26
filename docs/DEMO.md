# Environment Demo (demo.lintasair.com)

Demo adalah **instalasi baru dari sistem yang sama**, bukan salinan database
produksi. Kode, skema, RLS, fungsi, dan alur transaksi sama; isi database demo
dibiarkan kosong.

## Aturan yang tidak boleh dilanggar

1. Demo memakai **project Supabase terpisah** dari produksi.
2. Tidak ada **data operasional contoh**: tidak ada kapal, jadwal, kursi,
   penumpang, pesanan, tiket, pembayaran, manifest, fee, atau file storage
   contoh.
3. Demo **tidak memiliki Superadmin**. `/superadmin`,
   `/dashboard-superadmin`, dan `/api/superadmin/*` ditutup oleh `proxy.ts`
   saat `DEMO_MODE=true`.
4. Superadmin REAL memantau demo lewat server:
   - `GET /api/superadmin/demo/penyewa`
   - `GET /api/superadmin/demo/fee?bulan=YYYY-MM`
   Browser tidak pernah memegang service role key demo.
5. Fee demo selalu diberi label **SIMULASI — bukan pendapatan nyata**.

## Isi demo

| Ada | Tidak ada |
|---|---|
| Skema tabel + constraint + index | Data kapal/jadwal/kursi |
| RLS, policy, function, trigger | Pesanan/tiket/pembayaran/manifest |
| Master referensi (kota/rute) | Fee dan audit log transaksi |
| Pengaturan platform/teks/sistem | File storage/upload nyata |
| Akun bootstrap (opsional, 0 atau 1) | Akun Superadmin |

Akun bootstrap hanya boleh satu akun netral untuk masuk pertama kali. Kalau
tidak dipakai, biarkan `profiles` kosong dan daftar lewat halaman registrasi
biasa.

## Environment REAL (www.lintasair.com)

```env
# Kredensial database REAL yang sudah ada
NEXT_PUBLIC_SUPABASE_URL=https://<real>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Server-only: untuk membaca database demo dari halaman Superadmin REAL
DEMO_SUPABASE_URL=https://<demo>.supabase.co
DEMO_SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_DEMO_URL=https://demo.lintasair.com
DEMO_MODE=false
```

## Environment DEMO (demo.lintasair.com)

```env
# Kredensial project DEMO, bukan project real
NEXT_PUBLIC_SUPABASE_URL=https://<demo>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

NEXT_PUBLIC_SITE_URL=https://demo.lintasair.com
NEXT_PUBLIC_INDEXABLE=false
DEMO_MODE=true
```

Jangan mengisi `DEMO_SUPABASE_URL` di deployment demo dengan URL real.

## Membangun database demo (setelah schema-only dump tersedia)

Repo ini hanya berisi migrasi incremental; **belum ada base schema** yang bisa
membangun database kosong dari nol. Langkah yang benar:

1. Ambil **schema-only dump** dari project real (tanpa data):
   `pg_dump --schema-only --no-owner --no-privileges ... > schema-real.sql`
2. Buat project Supabase demo baru.
3. Jalankan `schema-real.sql` di SQL Editor demo.
4. Jalankan migrasi incremental dari repo dengan urutan aman:
   `security-hardening` → `security-tahap2` → `security-tahap2b-grant` →
   `security-tahap3-publik` → `kursi-segmen` → `security-tahap4-rls`.
5. **Jangan** menjalankan seed/data contoh apa pun.
6. Verifikasi dengan `node scripts/verify-demo-clean.mjs`.

## Verifikasi wajib

Jalankan di mesin yang punya env demo:

```bash
node scripts/verify-demo-clean.mjs
```

Script akan gagal kalau ada kapal/jadwal/kursi/pesanan/pembayaran/audit/refund
atau akun Superadmin di demo. Storage bucket juga diperiksa; bucket boleh ada,
tetapi harus kosong.

## Konsekuensi desain

- Satu filter tenant yang lupa dipasang tidak bisa membocorkan data real ke
  demo (dan sebaliknya), karena database-nya berbeda.
- Backup, auth, storage, dan laporan fee demo terisolasi.
- Etalase publik demo tetap memakai kode yang sama; karena database demo kosong,
  tidak ada kapal/jadwal real yang tampil.
