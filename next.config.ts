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