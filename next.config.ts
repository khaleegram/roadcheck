import type { NextConfig } from "next";

const LIVE_URL = "https://roadcheck-production.up.railway.app";

const nextConfig: NextConfig = {
  // Vercel has no writable disk for the report store, so its deployment forwards to the live host.
  async redirects() {
    if (process.env.VERCEL !== "1") return [];
    return [{ source: "/:path*", destination: `${LIVE_URL}/:path*`, permanent: false }];
  },
};

export default nextConfig;
