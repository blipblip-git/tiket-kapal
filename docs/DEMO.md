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

**Penting:** demo harus menjadi **project Vercel terpisah** dari real. Jangan
menambahkan `demo.lintasair.com` sebagai domain kedua di project real, karena
environment variable Vercel berlaku untuk seluruh project — `DEMO_MODE=true`
akan ikut menutup area Superadmin di real.

## Membangun database demo (setelah schema-only dump tersedia)

Repo ini hanya berisi migrasi incremental; **belum ada base schema** yang bisa
membangun database kosong dari nol. Langkah yang benar:

1. Ambil **schema-only dump** dari project real (tanpa data):
   `pg_dump --schema-only --no-owner --no-privileges ... > schema-real.sql`
2. Buat project Supabase demo baru.
3. Jalankan `schema-real.sql` di SQL Editor demo.
4. Jalankan migrasi incremental dari repo dengan urutan aman:
   `security-hardening` → `security-tahap2` → `security-tahap2b-grant` →
   `security-tahap3-publik` → `kursi-segmen`.
5. **Jangan** menjalankan `security-tahap4-rls.sql` hanya di demo kalau di real
   belum dijalankan. Tujuannya demo punya skema yang sama dengan real. Jalankan
   tahap 4 di **keduanya** setelah disetujui, atau lewati dulu.
6. **Jangan** menjalankan seed/data contoh apa pun.
7. Verifikasi dengan `node scripts/verify-demo-clean.mjs`.

## Akun bootstrap demo (wajib 1 akun admin)

Pendaftaran mandiri (`/daftar-admin` dan `/registrasi-admin`) **ditutup**, jadi
demo tidak bisa dimulai dari `profiles` kosong lalu mendaftar lewat UI. Buat
satu akun `admin_utama` netral langsung lewat SQL Editor demo, setelah skema
selesai dan sebelum login pertama.

1. Buat hash password dengan perintah Node (sama dengan hash aplikasi):

   ```bash
   node -e "const {randomBytes,pbkdf2Sync}=require('crypto');const p=process.argv[1];const s=randomBytes(16);const h=pbkdf2Sync(p,s,120000,32,'sha256');console.log('pbkdf2$120000$'+s.toString('base64')+'$'+h.toString('base64'))" 'PASSWORD_DEMO'
   ```

2. Jalankan di SQL Editor **database demo**:

   ```sql
   insert into public.profiles
     (id, email, nama, nama_perusahaan, nomor_hp, role, aktif, password_hash)
   values
     (gen_random_uuid(), 'demo@lintasair.com', 'Admin Demo',
      'Demo Lintas Air', null, 'admin_utama', true, 'HASH_DARI_LANGKAH_1');
   ```

3. Login di `https://demo.lintasair.com/login` memakai email
   `demo@lintasair.com` dan password tadi. Pada login pertama, server membuat
   akun Supabase Auth otomatis dan menyimpan `auth_user_id`.

Akun ini **bukan** Superadmin. Jangan membuat akun `role='superadmin'` di demo.
Setelah akun bootstrap ada, `npm run demo:verify` tetap harus lulus (script
hanya melarang data operasional dan akun Superadmin).

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
