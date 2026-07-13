import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@paradoxui/ui', '@paradoxui/tokens'],
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
    ],
  },
}

export default nextConfig
