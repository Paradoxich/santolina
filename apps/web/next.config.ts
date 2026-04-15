import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@paradoxui/ui', '@paradoxui/tokens'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
}

export default nextConfig
