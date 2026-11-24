import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // apex -> www dengan status 308 (PERMANEN).
  // Redirect-nya kini ditangani langsung oleh Vercel (Domains -> lintasair.com ->
  // "Redirect to Another Domain" -> 308 Permanent Redirect), jadi request ke apex
  // tidak sampai ke aplikasi ini. Aturan di bawah dipertahankan sebagai jaring
  // pengaman bila suatu saat redirect di dashboard dimatikan: tanpa ini apex akan
  // menyajikan aplikasi apa adanya (duplikat konten) alih-alih 308 ke www.
  // ==================== HEADER KEAMANAN ====================
  // Sebelum ini satu-satunya header keamanan berasal dari Vercel (HSTS), jadi
  // aplikasi bisa dibingkai di situs lain (clickjacking) dan tidak punya
  // pembatas sumber daya sama sekali. HSTS sengaja TIDAK ditulis di sini:
  // Vercel sudah mengirim `strict-transport-security: max-age=63072000`, dan
  // menambah lagi hanya menghasilkan header ganda saat audit.
  async headers() {
    const csp = [
      "default-src 'self'",
      // Next.js menyisipkan skrip bootstrap inline, jadi 'unsafe-inline' wajib;
      // tanpa itu halaman tampil tapi tidak pernah hidrasi. 'wasm-unsafe-eval'
      // dibutuhkan tesseract.js (OCR KTP). eval() penuh TIDAK diizinkan.
      // jsdelivr + unpkg = tempat tesseract.js mengunduh worker & core wasm.
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self' data:",
      // Supabase (REST + realtime/WSS) dan aset OCR (worker, wasm, data bahasa).
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://cdn.jsdelivr.net https://unpkg.com https://tessdata.projectnaptha.com",
      "worker-src 'self' blob:",
      // Cetak memakai window.print(), tapi html2canvas/html-to-image membuat
      // iframe/blob sementara — 'self' + blob: cukup, tanpa membuka situs luar.
      "frame-src 'self' blob:",
      "child-src 'self' blob:",
      "media-src 'self' blob:",
      "manifest-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          // Redundan dengan frame-ancestors untuk browser lama.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Kamera: scan/OCR KTP. Geolokasi: isi otomatis kota asal terdekat di
          // halaman pembeli & syahbandar. Sisanya ditutup.
          // Catatan: 'bluetooth'/'serial' tidak dicantumkan karena Chrome
          // melaporkannya sebagai "Unrecognized feature" (mengotori konsol).
          {
            key: "Permissions-Policy",
            value:
              "camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), display-capture=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "lintasair.com" }],
        destination: "https://www.lintasair.com/:path*",
        permanent: true,
      },
      // Alamat bawaan Vercel -> domain resmi. Tanpa ini mesin pencari melihat
      // dua situs kembar (www.lintasair.com dan tiket-kapal.vercel.app) dengan
      // konten identik. Hanya host produksi ini yang dialihkan; deployment
      // preview memakai host lain (tiket-kapal-<hash>-<tim>.vercel.app) dan
      // sengaja TIDAK dialihkan supaya tetap bisa dipakai uji coba.
      {
        source: "/",
        has: [{ type: "host", value: "tiket-kapal.vercel.app" }],
        destination: "https://www.lintasair.com/",
        permanent: true,
      },
      {
        // /api dikecualikan: klien integrasi tenant mengirim POST + body, dan
        // sebagian klien HTTP tidak meneruskan body saat mengikuti redirect.
        // Endpoint API juga tidak pernah diindeks mesin pencari, jadi tidak
        // ada kerugian SEO dengan membiarkannya di host lama.
        source: "/:path((?!api(?:/|$)).+)",
        has: [{ type: "host", value: "tiket-kapal.vercel.app" }],
        destination: "https://www.lintasair.com/:path",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;