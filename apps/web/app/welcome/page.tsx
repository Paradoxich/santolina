import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getSessionGardenContext } from '@/lib/session-garden'
import { FirstRunLocation } from '@/components/FirstRunLocation'

export const metadata: Metadata = {
  title: 'Welcome to Santolina',
}

// The required first-run location step. Reachable only by a signed-in user
// whose garden has no location yet; everyone else is redirected away. See
// docs/architecture.md §24.
export default async function WelcomePage() {
  const ctx = await getSessionGardenContext()

  // Not signed in — nothing to set up here.
  if (!ctx) redirect('/login?next=/welcome')

  // Location already captured — first run is done.
  if (ctx.garden?.city) redirect('/dashboard')

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-page px-4 py-12">
      <div className="w-full max-w-sm">
        <FirstRunLocation />
      </div>
    </main>
  )
}
