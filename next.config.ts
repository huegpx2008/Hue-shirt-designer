import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['10.0.0.168'],
  poweredByHeader: false,
  async headers() {
    const publicAssetHeaders = [
      { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
    ];
    const catalogAssetHeaders = [
      { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' },
      { key: 'X-Robots-Tag', value: 'noindex' },
    ];
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
      ...(process.env.NODE_ENV === 'production'
        ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
        : []),
    ];
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }] },
      { source: '/brand/:path*', headers: publicAssetHeaders },
      { source: '/template-thumbnails/:path*', headers: publicAssetHeaders },
      { source: '/data/catalog/:path*', headers: catalogAssetHeaders },
      ...['banners.webp', 'mesh.webp', 'coro.webp', 'rigid-products.webp', 'dtg-bc3001-white.webp', 'dtg-bc3001-black.webp']
        .map((asset) => ({ source: `/${asset}`, headers: publicAssetHeaders })),
    ];
  },
};

export default nextConfig;
