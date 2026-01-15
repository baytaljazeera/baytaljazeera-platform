import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
    proxyClientMaxBodySize: '50mb',
  },
  allowedDevOrigins: ['*.replit.dev', '*.spock.replit.dev', '127.0.0.1', 'localhost'],
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      { hostname: "via.placeholder.com" },
      { hostname: "**.unsplash.com" },
      { hostname: "picsum.photos" },
      { hostname: "**.s3.amazonaws.com" },
      { hostname: "res.cloudinary.com" },
      { hostname: "**.cloudinary.com" },
    ],
  },
  // Proxy API requests to backend (only in development)
  async rewrites() {
    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_API_URL) {
      return [
        {
          source: "/api/:path*",
          destination: `${process.env.NEXT_PUBLIC_API_URL}/api/:path*`,
        },
        {
          source: "/uploads/:path*",
          destination: `${process.env.NEXT_PUBLIC_API_URL}/uploads/:path*`,
        },
      ];
    }
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8080/api/:path*",
      },
      {
        source: "/uploads/:path*",
        destination: "http://127.0.0.1:8080/uploads/:path*",
      },
    ];
  },
  // Security headers - CORS handled by backend, frontend adds security headers only
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
        ],
      },
    ];
  },
};

export default nextConfig;
