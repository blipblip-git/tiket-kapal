# Backup Database Harian

Backup otomatis untuk project **tiket-kapal** (Supabase). Dua metode, satu perintah:

```bash
bash scripts/backup-db.sh      # atau: npm run backup (khusus metode REST)
```

| Metode | Kapan dipakai | Isi yang dicadangkan |
|---|---|---|
| `pg_dump` | `pg_dump` terpasang **dan** env `SUPABASE_DB_URL` diisi | Skema + seluruh data (kecuali `auth.users`) |
| REST (`scripts/backup-data.mjs`) | Default di mesin ini (pg_dump belum ada) | Isi tabel `public` (16 tabel), **tanpa** skema & tanpa `auth.users` |

Skema database tidak perlu dicadangkan asal file migrasi di `supabase/*.sql` utuh — dari situ
database kosong bisa dibangun ulang. Yang tidak bisa dibangun ulang adalah **data**, dan itu
yang diambil skrip ini.

## Hasil backup

```
~/backup-tiket-kapal/
├── db-20261124-214749/          # satu folder per backup (waktu UTC)
│   ├── audit_log.ndjson.gz
│   ├── jadwal.ndjson.gz
│   ├── kapal.ndjson.gz
│   ├── ...
│   └── manifest.json            # jumlah baris per tabel + hasil verifikasi
└── db-20261124-.../             # backup sebelumnya (retensi 14 folder terakhir)
```

- Format `.ndjson.gz` = satu baris JSON per record, di-gzip. Bisa dibaca dengan
  `gunzip -c profiles.ndjson.gz | head` dan dipulihkan per tabel.
- **Setiap tabel diverifikasi**: skrip menghitung ulang baris dari file yang sudah ditulis
  dan membandingkannya dengan jumlah dari API. Kalau tidak sama → tabel ditandai `GAGAL`
  dan skrip keluar dengan kode 1. Backup yang "kelihatan ada" tapi terpotong adalah musuh utama.
- Permission `700` (folder) dan `600` (file): backup memuat NIK, nomor HP, dan hash password.
  Jangan pindahkan ke folder yang bisa dibaca user lain, jangan commit ke git
  (`.gitignore` sudah menutup `/backups/` dan `*.dump`).

## Jadwal harian (cron)

Pasang sekali:

```bash
chmod +x ~/projects/tiket-kapal/scripts/backup-db.sh
crontab -e
```

Tambahkan satu baris (ganti path `node` sesuai hasil `command -v node`; cron tidak membaca
`PATH` shell interaktif):

```cron
7 2 * * * NODE_BIN=/home/axioo/.nvm/versions/node/v24.21.0/bin/node /bin/bash /home/axioo/projects/tiket-kapal/scripts/backup-db.sh >> /home/axioo/backup-tiket-kapal/backup.log 2>&1
```

Cek hasilnya besok pagi:

```bash
tail -30 ~/backup-tiket-kapal/backup.log
ls -1 ~/backup-tiket-kapal | tail -3
```

## Cara memulihkan (restore)

**Satu tabel dari backup REST** — ambil baris yang hilang, lalu masukkan lewat SQL Editor
atau REST dengan service role:

```bash
# lihat isi
gunzip -c ~/backup-tiket-kapal/db-20261124-214749/kapal.ndjson.gz | head -2

# jadikan file JSON array untuk diunggah manual (mis. ke Supabase Table Editor)
gunzip -c ~/backup-tiket-kapal/db-20261124-214749/kapal.ndjson.gz | jq -s . > /tmp/kapal.json
```

Urutan restore yang aman (karena ada foreign key): `profiles` → `kapal` → `template_jadwal`
→ `jadwal` → `kursi` → `kursi_pakai` → `pesanan` → `pembayaran` → sisanya.

**Dump penuh (kalau memakai `pg_dump`)** — restore ke project Supabase lain/kosong:

```bash
# 1) bangun skema dulu dari file migrasi
#    supabase/security-hardening.sql -> security-tahap2 -> security-tahap2b-grant
#    -> security-tahap3-publik -> publik-etiket-balita -> kursi-segmen -> fee-laporan -> ...
# 2) pulihkan data
pg_restore --no-owner --no-privileges --data-only --dbname "$SUPABASE_DB_URL" db-2026....dump
```

## Yang TIDAK dicadangkan

1. **`auth.users`** (akun Supabase Auth). REST tidak bisa membacanya dan `pg_dump` biasa
   juga tidak menyertakan skema `auth` dengan kredensial yang bisa dipakai ulang.
   Akibatnya: setelah restore ke project baru, staf **harus login ulang** — login pertama
   akan membuat sesi Auth baru (`lib/akunAuth.ts`) selama `profiles.password_hash` ikut
   terpulihkan (memang ikut, karena `profiles` dicadangkan).
2. **Skema/tabel baru yang belum masuk `supabase/*.sql`.** Kalau ada perubahan skema lewat
   SQL Editor, simpan juga file SQL-nya ke folder `supabase/`.
3. **File di Storage bucket `kapal`** (foto kapal). Kalau nanti dipakai, tambahkan
   `supabase storage cp -r` atau unduh manual dari dashboard.

## Checklist sebelum mengandalkan backup ini

- [ ] `bash scripts/backup-db.sh` selesai tanpa baris `GAGAL`.
- [ ] `manifest.json` menunjukkan `baris` = `dicek` untuk semua tabel.
- [ ] Cron sudah terpasang dan log muncul keesokan harinya.
- [ ] Salinan disimpan juga di luar mesin ini (flashdisk/Google Drive) minimal 1×/minggu —
      backup yang hanya ada di laptop yang sama tidak menolong saat laptop rusak/hilang.
