<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Aturan Auto-Push (WAJIB, jangan nunggu diminta)

Setiap kali selesai revisi kode, langsung jalankan berurutan di `~/projects/tiket-kapal`:

1. `npx next build` — wajib `EXIT=0`. Kalau gagal, perbaiki dulu, **jangan push**.
2. `git add -A && git commit -m "<pesan revisi yang jelas>"`
3. `git push origin main` — Vercel auto-deploy dari `origin/main`.

Setelah push: pastikan `git status` bersih dan `git log origin/main -1` = commit lokal. Detail lengkap ada di `PROJECT-NOTES.md` bagian 11 ("Alur Wajib Setelah Setiap Revisi").
