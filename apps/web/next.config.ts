import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@paradoxui/ui', '@paradoxui/tokens'],
  experimental: {
    serverActions: {
      // Diary photo uploads travel through a server action; Next's default
      // 1mb cap rejects most photos with an opaque "unexpected response"
      // error. 4mb sits just under Vercel's ~4.5mb request-body ceiling —
      // raising it further has no effect there. Larger photos need
      // client-side downscaling (future work, pairs with EXIF stripping).
      bodySizeLimit: '4mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'bs.plantnet.org',
      },
      {
        protocol: 'https',
        hostname: 'd2seqvvyy3b8p2.cloudfront.net',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        pathname: '/powop-assets/**',
      },
      {
        // Editorial hero images sourced from Wikimedia Commons (the vision pass
        // + feeder). next/image fetches the original and serves it resized.
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
        pathname: '/wikipedia/commons/**',
      },
    ],
  },
}

export default nextConfig
