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
    ];
  },
};

export default nextConfig;