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
  // Redirect bawaan dashboard Vercel ("Redirect to www.lintasair.com") keluar
  // sebagai 307 sementara, jadi redirect-nya dipindah ke sini.
  // PENTING: setting redirect pada domain lintasair.com di dashboard Vercel harus
  // DIMATIKAN (domain di-connect ke Production, bukan "Redirect to"), kalau tidak
  // redirect Vercel (307) jalan lebih dulu dan aturan ini tidak pernah dipakai.
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