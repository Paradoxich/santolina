import { Suspense } from 'react'
import type { Metadata } from 'next'
import { DitheredImage } from '@paradoxui/ui'
import { LoginForm } from '@/components/LoginForm'

export const metadata: Metadata = {
  title: 'Welcome to Santolina',
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen bg-surface-page">
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-[360px]">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
      <div className="hidden py-5 pr-5 lg:flex lg:w-1/2">
        <DitheredImage
          src="/textures/signup-hero-landscape.jpg"
          className="flex-1 rounded-card-tile bg-accent"
          levels={14}
          cell={2}
          hoverMode="spotlight"
          revealRadius={100}
          softness={0.8}
          weight={0.5}
        />
      </div>
    </main>
  )
}
