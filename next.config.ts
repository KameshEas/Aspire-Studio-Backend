import type { NextConfig } from "next";
import { CORS_HEADERS, SECURITY_HEADERS } from "./lib/cors";

const nextConfig: NextConfig = {
  async headers() {
    const allHeaders = { ...CORS_HEADERS, ...SECURITY_HEADERS };
    return [
      {
        source: "/api/:path*",
        headers: Object.entries(allHeaders).map(([key, value]) => ({ key, value })),
      },
    ];
  },
};

export default nextConfig;
