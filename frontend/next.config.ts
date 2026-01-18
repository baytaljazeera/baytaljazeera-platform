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
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
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
  // Proxy API requests to backend
  async rewrites() {
    // In production, NEXT_PUBLIC_API_URL must be set
    if (process.env.NODE_ENV === 'production') {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) {
        console.warn('⚠️ WARNING: NEXT_PUBLIC_API_URL is not set in production!');
        console.warn('   API requests will fail. Please set NEXT_PUBLIC_API_URL in Vercel environment variables.');
        // Return empty rewrites to prevent routing to localhost
        return [];
      }
      return [
        {
          source: "/api/:path*",
          destination: `${apiUrl}/api/:path*`,
        },
        {
          source: "/uploads/:path*",
          destination: `${apiUrl}/uploads/:path*`,
        },
      ];
    }
    // Development: use local backend
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
