import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    unoptimized: true,
  },
  // Cloudflare Pages doesn't support some Node.js APIs
  // Using static imports instead of fs at runtime
  serverExternalPackages: [],
};

export default nextConfig;
