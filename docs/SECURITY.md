# Keamanan (panduan singkat)

Dokumen ini hanya berisi hal yang **bisa dijalankan**: apa yang otomatis, apa yang
perlu dipasang sekali, dan apa yang wajib dijalankan manual di Supabase.

Prinsipnya: keamanan yang menentukan ada di **database (RLS + hak eksekusi fungsi)**
dan di **server** (harga & validasi tidak pernah dari browser). Alat di bawah hanya
lapis pelengkap supaya kesalahan kecil tidak lolos.

---

## 1. Sudah otomatis (tanpa dipasang)

| Alat | Yang dijaga | Dimana |
|---|---|---|
| **Dependabot** | Dependency (npm + GitHub Actions) yang punya CVE / versi baru | `.github/dependabot.yml` → PR otomatis tiap Senin 07:00 WIB |
| **Supabase Security Advisor** | RLS mati, fungsi `SECURITY DEFINER` terbuka untuk `anon`, `search_path` mutable | Dashboard → Advisors |
| **GitHub Secret Scanning** | Kunci yang ter-commit di repo publik/privat | GitHub → Settings → Code security |

Dependabot: kalau PR-nya hijau di `npm run build`, langsung Merge. Patch + minor
digabung jadi satu PR; major (Next/React) sengaja tidak diotomatiskan.

## 2. Pasang sekali per komputer: gitleaks (penahan rahasia)

Fungsinya menolak commit yang membawa kunci/token asli. Berjalan lokal, **tidak
ada hubungannya dengan loading website**.

```bash
# Linux (x64)
curl -sSL https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz \
  | tar -xz -C ~/.local/bin gitleaks

# macOS
brew install gitleaks

# Windows
winget install gitleaks
```

Aktifkan hook di repo ini:

```bash
git config core.hooksPath .githooks
```

Cek manual kapan saja:

```bash
npm run secret:scan          # seluruh repo + seluruh history commit
npm run secret:scan:staged   # hanya yang sedang di-stage
```

Hook bersifat **fail-open**: kalau gitleaks belum terpasang di komputer lain,
commit tetap jalan (hanya muncul peringatan). Jadi tidak ada yang terblokir.

Kalau gitleaks menolak commit padahal nilainya bukan rahasia (misal teks contoh),
tambahkan pengecualian di `.gitleaks.toml`.

Kunci yang **sudah** ter-commit sebelumnya dianggap bocor: rotasi di dashboard
Supabase (Project Settings → API) atau di dashboard gateway pembayaran.

## 3. Wajib dijalankan manual di Supabase (project REAL)

Dua berkas ini menutup celah yang tidak bisa diperbaiki dari kode aplikasi.
Jalankan di **SQL Editor** project produksi (bukan demo), lalu cek Security Advisor
harus berkurang.

1. `supabase/security-rpc-petugas.sql`
   Mencabut hak `anon`/`authenticated` atas `public.buat_akun_petugas(...)` —
   fungsi `SECURITY DEFINER` lama yang bisa membuat akun `admin_utama` tanpa login.
   Fungsi ini sudah tidak dipakai kode aplikasi.
2. `supabase/security-search-path.sql`
   Mengunci `search_path` fungsi sisa (`normalisasi_nomor_hp`,
   `normalisasi_nomor_hp_profil`, `buat_akun_petugas`, `release_expired_holds`).

Selain itu, di Dashboard:

- **Auth → Settings → Password security → Leaked password protection: ON**
  (menolak password yang sudah ada di HaveIBeenPwned).
- **Advisors** dibuka sebelum rilis dan sesudah migrasi SQL.

## 4. Sebelum rilis (2 menit)

```bash
npm run secret:scan      # harus "no leaks found"
npm audit --omit=dev     # lihat sisa CVE
npm run build            # pastikan tetap hijau
```

Lalu buka Supabase → Advisors untuk project yang akan dipakai.

## 5. Yang sengaja BELUM dikerjakan (tercatat)

| Hal | Risiko | Rencana |
|---|---|---|
| `xlsx@0.18.5` (prototype pollution + ReDoS) | Rendah — hanya dipakai **menulis** file di `/backup-data`, tidak mem-parsing file unggahan orang | Ganti ke `xlsx@0.20.3` (dari cdn.sheetjs.com) sekaligus `await import('xlsx')` agar halaman lebih ringan |
| `publik_tiket_hp(p_hp)` bisa dipanggil `anon` | Sedang — nomor HP bisa ditebak sehingga tiket orang lain bisa dilihat | Pindah ke `/api/publik/tiket-hp` + rate limit + **wajib kode tiket** untuk membuka e-tiket lengkap |
| `profiles.password_plain` (warisan) | Sedang — password teks biasa | Login sudah otomatis migrasi ke hash; hapus kolom setelah semua akun pernah login |
| Rate limit di `lib/rateLimit.ts` disimpan di memori proses | Rendah — reset saat cold start / pindah instance | Cukup untuk anti-spam; kalau nanti ramai, pasang rate limit di Vercel Firewall / Cloudflare |
