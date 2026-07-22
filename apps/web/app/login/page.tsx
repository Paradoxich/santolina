import { Suspense } from 'react'
import type { Metadata } from 'next'
import { LoginForm } from '@/components/LoginForm'

export const metadata: Metadata = {
  title: 'Welcome to Santolina',
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-page px-4 py-12">
      <div className="w-full max-w-[360px] rounded-card-tile border border-card-translucent bg-surface-card p-section-break">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  )
}
