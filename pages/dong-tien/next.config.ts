import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/dong-tien",
  output: "standalone",
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
      `connect-src 'self' https://www.facebook.com https://connect.facebook.net https://*.google-analytics.com https://www.googletagmanager.com https://*.google.com https://*.google.com.vn https://*.googleadservices.com https://*.doubleclick.net${process.env.NODE_ENV !== 'production' ? ' ws://localhost:* ws://127.0.0.1:*' : ''}`,
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
  async redirects() {
    return [
      {
        source: "/dong-tien",
        destination: "/",
        permanent: true,
      },
      {
        source: "/dong-tien/:path*",
        destination: "/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
