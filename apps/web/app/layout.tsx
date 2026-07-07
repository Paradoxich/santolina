import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import '../styles/globals.css'

export const metadata: Metadata = {
  title: 'Santolina — Plant Care',
  description: 'Track and care for your plants with Santolina.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
