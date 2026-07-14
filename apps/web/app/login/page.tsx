import { Suspense } from 'react'
import type { Metadata } from 'next'
import { LoginForm } from '@/components/LoginForm'
import { DitheredHero } from '@/components/DitheredHero'

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
        <div className="relative flex-1 overflow-hidden rounded-card-tile bg-accent">
          {/* Fallback for no-WebGL / no-JS: the plain photo. The shader canvas
              paints over it (Ken Burns orbit + screen-locked dither) once it
              initialises. */}
          <img
            src="/textures/signup-hero-landscape.jpg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <DitheredHero
            src="/textures/signup-hero-landscape.jpg"
            levels={14}
            cell={2}
            hoverMode="spotlight"
            revealRadius={100}
            softness={0.8}
            weight={0.5}
          />
        </div>
      </div>
    </main>
  )
}
