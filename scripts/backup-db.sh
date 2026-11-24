#!/usr/bin/env bash
# Backup harian database tiket-kapal.
#
#   bash scripts/backup-db.sh
#
# Dua jalur:
# 1. pg_dump  — kalau `pg_dump` terpasang DAN SUPABASE_DB_URL diisi:
#               dump penuh (skema + data, kecuali auth.users).
# 2. REST     — kalau tidak, pakai scripts/backup-data.mjs (isi tabel public saja).
#
# Variabel opsional:
#   BACKUP_DIR    folder tujuan (default: ~/backup-tiket-kapal)
#   BACKUP_KEEP   jumlah backup yang disimpan (default: 14)
#   SUPABASE_DB_URL  connection string Postgres dari Supabase
#                    (Project Settings -> Database -> Connection string -> URI)
set -euo pipefail

DIR_SCRIPT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DIR_BACKUP="${BACKUP_DIR:-$HOME/backup-tiket-kapal}"
SIMPAN="${BACKUP_KEEP:-14}"

mkdir -p "$DIR_BACKUP"

catat() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

if command -v pg_dump >/dev/null 2>&1 && [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  catat "Metode: pg_dump (dump penuh)"
  stempel="$(date +%Y%m%d-%H%M%S)"
  berkas="$DIR_BACKUP/db-$stempel.dump"
  # --no-owner/--no-privileges: dump bisa dipulihkan ke project Supabase lain.
  pg_dump --no-owner --no-privileges --format=custom --file="$berkas" "$SUPABASE_DB_URL"
  catat "Selesai: $berkas ($(du -h "$berkas" | cut -f1))"
  # Buang dump lama di luar masa simpan.
  find "$DIR_BACKUP" -maxdepth 1 -name 'db-*.dump' -type f -mtime "+$SIMPAN" -print -delete \
    | sed 's/^/  dihapus: /' || true
else
  if command -v pg_dump >/dev/null 2>&1; then
    catat "pg_dump ada tapi SUPABASE_DB_URL kosong -> pakai REST"
  else
    catat "pg_dump tidak terpasang -> pakai REST (isi tabel public saja)"
  fi
  NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
  if [[ -z "$NODE_BIN" ]]; then
    catat "GAGAL: node tidak ditemukan di PATH"
    exit 2
  fi
  exec "$NODE_BIN" "$DIR_SCRIPT/backup-data.mjs" --out "$DIR_BACKUP" --keep "$SIMPAN"
fi
