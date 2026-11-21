# API Integrasi Tenant

Untuk tenant (operator kapal) yang mau menjual tiket dari **website/POS miliknya sendiri**.
Semua endpoint butuh header:

```
x-api-key: la_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- Kunci dibuat **Superadmin platform** (bukan tenant), disimpan sebagai hash SHA-256.
- Kunci terikat 1 tenant (`operator_id`). Hanya bisa melihat/menjual jadwal milik tenant itu.
- Harga **selalu** diambil dari database (`jadwal.harga`) — body request tidak bisa
  menurunkan/menaikkan harga. Kanal dipaksa `online` (kena fee platform).
- NIK disamarkan (`****************1234`) di dashboard, nomor HP dipakai untuk cek tiket.
- Pesanan `sudah_dibayar:false` kedaluwarsa **15 menit**; setelah itu buat pesanan baru.
- Balasan error selalu `{ "error": "..." }` dengan status 400/401/403/404/500.

## Membuat / mencabut kunci (Superadmin, SQL Editor Supabase)

```sql
-- 1. Cari operator_id tenant (admin_utama = pemilik akun tenant)
select id, nama, nama_perusahaan, role, coalesce(operator_id, id) as operator_id
from public.profiles
where role = 'admin_utama'
order by nama;

-- 2. Buat kunci. Kunci asli HANYA muncul sekali — simpan baik-baik.
select public.fn_buat_api_key('<operator_id tenant>', 'Website PT ABC') as api_key;

-- 3. Daftar kunci (tanpa kunci asli)
select * from public.fn_daftar_api_key();

-- 4. Cabut kunci
select public.fn_cabut_api_key('<id dari daftar>');
```

## GET /api/integrasi/jadwal

Query opsional: `tanggal=YYYY-MM-DD`, `limit` (default 100, maks 200).

```bash
curl -s "https://tiket-kapal.vercel.app/api/integrasi/jadwal?tanggal=2026-11-22" \
  -H "x-api-key: la_live_xxx"
```

```json
{
  "success": true,
  "jumlah": 1,
  "jadwal": [
    {
      "id": "uuid-jadwal",
      "tanggal": "2026-11-22",
      "jam_berangkat": "09:00",
      "rute_asal": "Tanjung Batu",
      "rute_tujuan": "Sungai Guntung",
      "harga": 45000,
      "kapal": "KM Sabuk Nusantara",
      "status": "aktif",
      "status_jadwal": "normal",
      "kursi_kosong": 32
    }
  ]
}
```

## GET /api/integrasi/kursi?jadwal_id=uuid

```bash
curl -s "https://tiket-kapal.vercel.app/api/integrasi/kursi?jadwal_id=uuid-jadwal" \
  -H "x-api-key: la_live_xxx"
```

```json
{
  "success": true,
  "jadwal_id": "uuid-jadwal",
  "kursi": [
    { "id": "uuid-kursi", "nomor_kursi": 1, "status": "kosong", "tersedia": true },
    { "id": "uuid-kursi-2", "nomor_kursi": 2, "status": "terisi", "tersedia": false }
  ]
}
```

`404` kalau jadwal bukan milik tenant itu / tidak ada.

## POST /api/integrasi/pesan

Body:

```json
{
  "jadwal_id": "uuid-jadwal",
  "kursi_ids": ["uuid-kursi-1", "uuid-kursi-2"],
  "penumpang": [
    { "nama": "Budi Santoso", "nik": "1234567890123456", "balita": ["Adik Budi"] },
    { "nama": "Siti Aminah", "nik": "6543210987654321", "balita": [] }
  ],
  "nomor_hp": "081234567890",
  "sudah_dibayar": true
}
```

- `kursi_ids` dan `penumpang` harus jumlahnya sama, maks 8 dewasa, tanpa kursi dobel.
- `balita` tidak butuh kursi (dibuat sebagai tiket `BALITA-...`, `is_balita: true`).
- `sudah_dibayar: true` → langsung `paid`, kursi jadi `terisi`, `pembayaran.metode='integrasi_api'`.
- `sudah_dibayar: false` → `pending` + `waktu_expired` 15 menit, konfirmasi lewat `/bayar`.

```bash
curl -s -X POST https://tiket-kapal.vercel.app/api/integrasi/pesan \
  -H "x-api-key: la_live_xxx" -H "Content-Type: application/json" \
  -d '{"jadwal_id":"uuid-jadwal","kursi_ids":["uuid-kursi-1"],"penumpang":[{"nama":"Budi Santoso","nik":"1234567890123456","balita":[]}],"nomor_hp":"081234567890","sudah_dibayar":true}'
```

```json
{
  "success": true,
  "grup_transaksi_id": "uuid-grup",
  "status": "paid",
  "total_harga": 45000,
  "waktu_expired": null,
  "jadwal": { "id": "uuid-jadwal", "tanggal": "2026-11-22", "jam_berangkat": "09:00",
              "rute_asal": "Tanjung Batu", "rute_tujuan": "Sungai Guntung", "harga": 45000 },
  "tiket": [
    { "id": "uuid-pesanan", "kode_tiket": "TKT-9F3K2Q", "nama_penumpang": "Budi Santoso", "is_balita": false }
  ]
}
```

## POST /api/integrasi/bayar

Konfirmasi pelunasan untuk pesanan yang dibuat dengan `sudah_dibayar:false`.
Semua `ids` harus dari **satu jadwal** milik tenant itu.

```bash
curl -s -X POST https://tiket-kapal.vercel.app/api/integrasi/bayar \
  -H "x-api-key: la_live_xxx" -H "Content-Type: application/json" \
  -d '{"ids":["uuid-pesanan-1","uuid-pesanan-2"]}'
```

```json
{ "success": true, "sudah_lunas": false, "ids": ["uuid-pesanan-1", "uuid-pesanan-2"], "waktu_bayar": "2026-11-21T10:00:00.000Z" }
```

Kalau semua sudah lunas: `{ "success": true, "sudah_lunas": true, "ids": [...] }`.
Kalau lewat 15 menit: `400 { "error": "Waktu pembayaran sudah habis. Buat pesanan baru." }`.

## Catatan kalau kunci bocor

Cabut lewat `fn_cabut_api_key('<id>')` (baris tetap ada sebagai jejak audit), lalu buat
kunci baru dan pasang di server tenant. Kunci tidak bisa dibaca ulang dari database.
