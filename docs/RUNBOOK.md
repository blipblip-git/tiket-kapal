# RUNBOOK GANGGUAN — LintasAir (tiket-kapal)

Dokumen ini dipakai **saat ada masalah produksi**. Target: dalam 5 menit tahu ini
gangguan di aplikasi kita atau di penyedia, dan tidak mengambil keputusan panik
(reset database, hapus tabel, ganti kunci, dsb).

Aturan pertama: **kalau data terlihat hilang, berhenti menulis apa pun.** Setiap
tulisan baru membuat pemulihan dari backup makin rumit.

---

## 1. Peta sistem & titik gagal

| Komponen | Penyedia | Kalau mati, yang terjadi | Cara cek |
|---|---|---|---|
| Halaman & API | Vercel | Situs tidak terbuka / 500 / 404 semua halaman | vercel-status.com, tab Deployments |
| Database + Auth | Supabase (Postgres) | Halaman terbuka tapi data kosong / "Gagal memuat" | status.supabase.com, dashboard Usage |
| Domain & DNS | registrar / Vercel | "Site not found" atau DNS error | `nslookup www.lintasair.com` |
| Backup harian | laptop/mesin lokal (`~/backup-tiket-kapal`) | Tidak ada dampak langsung, tapi jaring pengaman hilang | `tail ~/backup-tiket-kapal/backup.log` |
| Gambar e-tiket | **browser pembeli** | Tidak ada di server, jadi tidak bisa jadi penyebab down | — |

Yang **tidak** menyimpan data: Vercel, browser, PWA. Jadi Vercel mati ≠ data hilang.

---

## 2. Triage 3 menit

```bash
# 1) Aplikasi hidup?
curl -s -o /dev/null -w '%{http_code}\n' https://www.lintasair.com/cari-tiket
#   200 = Vercel & Next.js sehat. 5xx = lihat skenario A. 000/timeout = DNS/ jaringan.

# 2) Database hidup? (kunci dibaca dari .env.local, tidak dicetak)
cd ~/projects/tiket-kapal && set -a && . ./.env.local && set +a && \
curl -s -o /dev/null -w '%{http_code}\n' \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/kapal?select=id&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
#   200 = database sehat. 401 = kunci salah/berubah. 5xx = Supabase bermasalah.
```

| Hasil | Artinya | Lanjut ke |
|---|---|---|
| Halaman 5xx | Masalah di Vercel / build | Skenario A |
| Halaman 200, data kosong/error | Masalah di Supabase | Skenario B |
| Keduanya 200 tapi lambat | Beban / query berat | Skenario H |

Cek juga status resmi: <https://status.supabase.com> dan
<https://www.vercel-status.com>. Kalau keduanya hijau dan pengguna masih
melaporkan error, minta screenshot + jam kejadian sebelum mengubah apa pun.

---

## 3. Skenario A — situs tidak bisa dibuka (Vercel)

1. Buka Vercel → project `tiket-kapal` → **Deployments**. Deployment teratas
   harus `Ready`. Kalau `Error`/`Building`, tunggu atau **Redeploy**.
2. Kalau deploy terakhir sukses tapi situs tetap rusak: **rollback** — pilih
   deployment terakhir yang dikenal baik → menu `⋯` → **Promote to Production**.
   Ini instan dan tidak menyentuh database.
3. Kalau semua deployment error padahal sebelumnya jalan: bandingkan dengan
   `git log --oneline -5`. Perbaiki kode, `npx next build` harus `EXIT=0`, push.
4. Setelah rollback/redeploy, minta pengguna **hard refresh** (Ctrl+Shift+R) —
   service worker PWA bisa menyajikan JS lama.

Catatan: build di mesin lokal yang gagal **jangan** di-push (aturan di `AGENTS.md`).

---

## 4. Skenario B — situs terbuka tapi data kosong / "Gagal memuat"

Urutkan dari yang paling sering:

1. **Kunci environment berubah/hilang di Vercel.** Settings → Environment
   Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SESI_TOKEN_SECRET` harus ada untuk Production.
   Setelah mengubah, **Redeploy** (env baru tidak dipakai deployment lama).
2. **Project Supabase di-pause** → Skenario C.
3. **Kuota habis** → Skenario D/E.
4. **RLS menolak** (gejala: login staf berhasil tapi daftar kosong). Uji dengan
   anon key vs service role:

```bash
set -a && . ./.env.local && set +a
# pakai anon key (seperti browser):
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/kapal?select=id&limit=1" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" | head -c 300; echo
# kosong/[] padahal ada data = RLS/ policy, bukan data hilang.
```

5. Baru setelah 1–4 jelas, lihat log: Vercel → Deployments → Functions → Logs
   (cari `error`, `Gagal`, `permission denied`, `JWT`).

---

## 5. Skenario C — project Supabase di-pause (plan Free)

Gejala: semua request ke Supabase gagal/timeout, dashboard menampilkan
"Project paused".

1. Supabase Dashboard → project → **Restore project**. Butuh beberapa menit.
2. Setelah hidup, **verifikasi data**, jangan langsung percaya:
   ```bash
   cd ~/projects/tiket-kapal && npm run backup   # backup pertama setelah pulih
   ```
   Bandingkan `manifest.json` backup baru dengan backup sebelumnya (jumlah baris
   per tabel). Selisih wajar hanya bila memang ada transaksi baru.
3. Pencegahan permanen: **upgrade ke Pro** (project Free pause setelah ~7 hari
   tanpa aktivitas, dan kuotanya 500 MB).

---

## 6. Skenario D — kuota database penuh ("disk full")

Gejala khas: halaman terbuka, **membaca data masih jalan**, tetapi tiket baru
gagal disimpan (log: `could not extend file`, `disk full`, HTTP 507). Ini bukan
"down total", tapi penjualan berhenti — perlakukan sebagai prioritas 1.

Langkah:

1. Cek pemakaian: Dashboard → **Settings → Usage** (atau Billing).
2. Cari tabel yang paling besar (SQL Editor):
   ```sql
   select relname as tabel,
          pg_size_pretty(pg_total_relation_size(relid)) as total,
          n_live_tup as baris
   from pg_catalog.pg_statio_user_tables
   order by pg_total_relation_size(relid) desc
   limit 10;
   ```
3. Kalau `kursi` memimpin (normal, lihat penjelasan di bawah), jalankan
   housekeeping:
   ```bash
   cd ~/projects/tiket-kapal
   npm run bersih:kursi -- --hari 180            # dry-run, lihat angkanya dulu
   npm run bersih:kursi -- --hari 180 --jalankan # baru hapus
   ```
   Script ini hanya menghapus kursi **status kosong** milik jadwal lama dan
   **tidak pernah** menghapus kursi yang dirujuk pesanan, jadi e-tiket lama aman.
4. Kalau `audit_log` besar, simpan dulu 3 bulan terakhir lalu pangkas:
   ```sql
   -- backup dulu: npm run backup ; lalu:
   delete from public.audit_log where waktu < now() - interval '6 months';
   ```
5. `vacuum full` **tidak** mengecilkan kuota akun Supabase (kuota dihitung dari
   ukuran database), tetapi ruang hasil DELETE dipakai ulang oleh baris baru —
   jadi angka di dashboard bisa tidak langsung turun. Yang menurunkan kuota
   adalah DELETE + waktu, atau upgrade plan.
6. Kalau tetap kurang: upgrade plan (Pro = 8 GB) atau arsipkan `jadwal` lama.

**Kenapa `kursi` yang besar:** setiap kali sebuah tanggal dibuka (pencarian
tiket / API `siapkan-jadwal`), sistem membuat satu baris kursi per nomor kursi.
100 kapal × 2 jadwal × 40 kursi = 8.000 baris/hari ≈ 3 juta baris/tahun.
Jadwalkan pembersihan **bulanan** (bagian 11) supaya tidak menumpuk.

---

## 7. Skenario E — kuota egress / bandwidth habis

Gejala: halaman kadang kosong, request ditolak 429/402, hanya sebagian pengguna
terdampak. Cek Dashboard → Usage → Egress.

- Sumber egress terbesar biasanya **gambar & laporan** (bukan database). Kalau
  ada endpoint yang mengirim file besar / seluruh baris tanpa `limit`, perbaiki
  dulu penyebabnya.
- Jangka pendek: naikkan plan; jangka panjang: pagination, `select` kolom
  seperlunya (hindari `select('*')` untuk tabel besar), cache di klien.

---

## 8. Skenario F — data terhapus / salah update (restore)

**BERHENTI menulis** ke tabel yang terdampak. Jangan jalankan `delete`/`update`
susulan, jangan restore seluruh database untuk satu baris.

1. Cari backup terakhir **sebelum** kejadian:
   ```bash
   ls -1 ~/backup-tiket-kapal | tail -5
   gunzip -c ~/backup-tiket-kapal/db-<stempel>/pesanan.ndjson.gz | grep '<kode_tiket>'
   ```
2. Restore **per baris / per tabel** (cara lengkap: `docs/BACKUP.md` bagian
   "Cara memulihkan"). Untuk beberapa baris, tempel hasil `grep` ke Supabase
   SQL Editor atau kirim lewat REST dengan service role.
3. Kalau yang hilang banyak (tabel terhapus, `update` massal salah):
   - Pro: Dashboard → **Database → Backups** (harian, 7 hari) → Restore. Ini
     membuat project baru dari backup; bandingkan dulu sebelum mengarahkan domain.
   - Lokal: `pg_restore` dari `scripts/backup-db.sh` bila `SUPABASE_DB_URL` diisi.
4. Verifikasi setelah restore: jumlah baris per tabel harus sama dengan
   `manifest.json` backup; cek 2–3 tiket nyata di `/etiket` dan `/scan`.
5. Catat kejadian di `PROJECT-NOTES.md` (apa, kapan, penyebab, pencegahan).

Ingat yang **tidak** ikut backup REST: `auth.users` (akun login) dan skema.
Skema bisa dibangun ulang dari `supabase/*.sql`; akun login harus dibuat ulang
lewat halaman superadmin bila benar-benar hilang.

---

## 9. Skenario G — kunci bocor / penyalahgunaan

Kalau `SUPABASE_SERVICE_ROLE_KEY` atau `SESI_TOKEN_SECRET` pernah terekspos
(screenshot, chat, repo publik):

1. Supabase → Settings → API → **rotate** service role / JWT secret.
2. Vercel → Environment Variables → ganti nilainya → **Redeploy**.
3. `SESI_TOKEN_SECRET` baru membuat semua token kolektor lama tidak berlaku
   (petugas cukup login ulang).
4. Periksa penyalahgunaan: `select * from audit_log order by waktu desc limit 50;`
   dan Usage → Egress/Requests untuk lonjakan aneh.
5. Anon key aman terlihat di browser; yang berbahaya adalah service role dan
   `SESI_TOKEN_SECRET`.

---

## 10. Skenario H — lambat saat ramai (bukan down)

1. Pastikan index tambahan sudah dijalankan: `supabase/index-tambahan.sql`
   (aman diulang, hanya `create index if not exists`).
2. Cari query lambat (SQL Editor):
   ```sql
   select query, calls, mean_exec_time, rows
   from pg_stat_statements
   order by mean_exec_time desc
   limit 10;
   ```
   Kalau `pg_stat_statements` belum aktif, aktifkan di Dashboard → Database →
   Extensions.
3. Pola yang paling sering jadi biang: laporan mengambil **semua** baris tanpa
   rentang tanggal, `select('*')` pada tabel besar, atau filter memakai kolom
   tanpa index (mis. `pesanan.nomor_hp` — sudah ditambahkan di SQL di atas).
4. Sementara: batasi rentang laporan (per bulan, bukan setahun), tambah `limit`,
   dan hindari memuat ulang seluruh daftar saat filter berubah.

---

## 11. Perawatan rutin (checklist)

**Harian (otomatis, cek hasilnya)**

```bash
tail -30 ~/backup-tiket-kapal/backup.log      # harus ada "SELESAI" & tanpa GAGAL
ls -1 ~/backup-tiket-kapal | tail -3          # folder db-YYYYMMDD-HHMMSS baru
```

**Bulanan (5 menit)**

```bash
cd ~/projects/tiket-kapal
npm run backup                               # backup manual sebelum utak-atik
npm run bersih:kursi -- --hari 180           # lihat kandidat
npm run bersih:kursi -- --hari 180 --jalankan
```

**Sekali sebulan: uji restore** (backup yang belum pernah di-restore = belum terbukti)

```bash
gunzip -c ~/backup-tiket-kapal/db-<stempel>/kapal.ndjson.gz | head -2
# lalu bandingkan jumlah baris di manifest.json dengan data sekarang:
set -a && . ./.env.local && set +a && \
curl -s -I "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/kapal?select=id" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H 'Prefer: count=exact' -H 'Range: 0-0' | grep -i content-range
```

**Setiap rilis:** `npx next build` harus `EXIT=0` sebelum push (aturan `AGENTS.md`).

**Contoh crontab** (backup 02:07, housekeeping tanggal 1 jam 03:20):

```cron
7 2 * * * NODE_BIN=/path/ke/node /bin/bash /home/axioo/projects/tiket-kapal/scripts/backup-db.sh >> /home/axioo/backup-tiket-kapal/backup.log 2>&1
20 3 1 * * cd /home/axioo/projects/tiket-kapal && NODE_BIN=/path/ke/node /path/ke/node scripts/bersih-kursi.mjs --hari 180 --jalankan >> /home/axioo/backup-tiket-kapal/bersih.log 2>&1
```

**Monitoring gratis yang disarankan:** UptimeRobot/BetterStack memantau
`https://www.lintasair.com/cari-tiket` (interval 5 menit, alert email/WA), plus
alert Usage di dashboard Supabase bila pemakaian > 70%.

---

## 12. Kuota & biaya (kenapa ini penting)

| | Supabase Free | Supabase Pro ($25/bln) | Vercel Hobby | Vercel Pro ($20/bln) |
|---|---|---|---|---|
| Database | 500 MB | 8 GB (lanjut $0.125/GB) | — | — |
| Egress | 5 GB | 250 GB | 100 GB/bulan (fair use) | 1 TB |
| Backup | — | harian, 7 hari | — | — |
| Project pause | ya (~7 hari idle) | tidak | — | — |
| Pemakaian komersial | boleh | boleh | **dilarang ToS** | boleh |

Konsekuensi praktis: pada ±100 kapal aktif, database bisa menyentuh 500 MB
dalam hitungan bulan (terutama `kursi` + `pesanan`). Free akan **pause** atau
**kehabisan kuota**, dan itu terasa seperti "tiba-tiba down". Untuk produksi
berbayar: Supabase Pro + Vercel Pro, total ± Rp 750 ribu/bulan.

---

## 13. Tautan & kontak

- Status penyedia: <https://status.supabase.com>, <https://www.vercel-status.com>
- Dashboard Supabase → Settings → Usage (kuota), Database → Backups (restore)
- Dashboard Vercel → Deployments (rollback), Functions → Logs (error runtime)
- Backup lokal: `~/backup-tiket-kapal` (detail: `docs/BACKUP.md`)
- Housekeeping kursi: `scripts/bersih-kursi.mjs` (`npm run bersih:kursi`)
- Index: `supabase/index-tambahan.sql`
- Riwayat keputusan & pelajaran: `PROJECT-NOTES.md`


