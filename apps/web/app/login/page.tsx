import { Suspense } from 'react'
import type { Metadata } from 'next'
import Image from 'next/image'
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
        <div className="relative flex-1 overflow-hidden rounded-card-tile bg-accent">
          {/* Wider than the panel so the orbiting drift always has slack.
              The outer strip oscillates on x, the inner wrapper on y; a
              quarter-period offset between them traces a smooth ellipse. */}
          <div className="animate-ken-burns absolute inset-y-0 left-0 w-[135%]">
            <div className="animate-ken-burns-y absolute inset-0">
              <Image
                src="/textures/signup-hero-landscape.jpg"
                alt=""
                fill
                priority
                sizes="(min-width: 1024px) 70vw, 0px"
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
