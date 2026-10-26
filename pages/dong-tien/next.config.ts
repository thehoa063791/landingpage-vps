import type { NextConfig } from "next";

// One app serves every course funnel under /<course> (same list as src/lib/courses.ts).
// Nginx forwards those prefixes and /_next to this server.
const COURSES = "dong-tien|trading";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: { cpus: 1 },
  reactStrictMode: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [],
    formats: ["image/webp", "image/avif"],
  },
  async headers() {
    const policy = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' https://connect.facebook.net https://www.googletagmanager.com https://www.googleadservices.com https://*.doubleclick.net${process.env.NODE_ENV !== 'production' ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://www.facebook.com https://*.google-analytics.com https://www.googletagmanager.com https://*.google.com https://*.google.com.vn https://*.googleadservices.com https://*.doubleclick.net",
      "font-src 'self'",
      // hubcrm.vn: HUB CRM funnel tracking script posts views to /api/tracking/landing-page.
      `connect-src 'self' https://hubcrm.vn https://www.facebook.com https://connect.facebook.net https://*.google-analytics.com https://www.googletagmanager.com https://*.google.com https://*.google.com.vn https://*.googleadservices.com https://*.doubleclick.net${process.env.NODE_ENV !== 'production' ? ' ws://localhost:* ws://127.0.0.1:*' : ''}`,
      "frame-src https://player.vimeo.com https://www.googletagmanager.com https://www.facebook.com https://*.doubleclick.net",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');
    return [{ source: '/:path*', headers: [
      { key: 'Content-Security-Policy', value: policy },
      { key: 'Referrer-Policy', value: 'same-origin' },
      { key: 'X-DNS-Prefetch-Control', value: 'off' },
    ] }];
  },
  async rewrites() {
    return [{ source: `/:course(${COURSES})/api/:path*`, destination: "/api/:course/:path*" }];
  },
  async redirects() {
    return [
      // The former Trading thank-you page; new learners land in the course instead.
      { source: "/trading/thank-you", destination: "/trading/learn", permanent: false },
    ];
  },
};

export default nextConfig;
