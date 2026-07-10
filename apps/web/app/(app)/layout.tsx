import { redirect } from 'next/navigation'
import { ToastProvider } from '@paradoxui/ui'
import { AppSidebar } from '@/components/AppSidebar'
import { MobileTabBar } from '@/components/MobileTabBar'
import { getSessionGardenContext } from '@/lib/session-garden'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // First-run gate: a signed-in user whose garden has no location must set one
  // before using the app. A null location IS the first-run flag — no separate
  // "onboarded" state (docs/architecture.md §24). Anonymous visitors fall
  // through to the single-tenant shim until the auth gate lands (item 6).
  const ctx = await getSessionGardenContext()
  if (ctx && !ctx.garden?.city) redirect('/welcome')

  return (
    <ToastProvider>
      <div className="min-h-screen bg-surface-page">
        <AppSidebar />
        <main className="px-4 pb-20 md:ml-[272px] md:mr-12 md:px-0 md:pb-0">
          {children}
        </main>
        <MobileTabBar />
      </div>
    </ToastProvider>
  )
}
