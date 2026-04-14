import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude Leaflet from SSR (it uses browser APIs)
  webpack: (config) => {
    config.resolve.fallback = { fs: false };
    return config;
  },
};

export default nextConfig;
