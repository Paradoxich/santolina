import { redirect } from 'next/navigation'
import { ToastProvider } from '@paradoxui/ui'
import { AppSidebar, type SidebarIdentity } from '@/components/AppSidebar'
import { MobileTabBar } from '@/components/MobileTabBar'
import {
  getSessionGardenContext,
  type SessionProfile,
} from '@/lib/session-garden'

function toSidebarIdentity(profile: SessionProfile): SidebarIdentity {
  const name = profile.displayName?.trim() || profile.email || 'Your account'
  return { name, avatarUrl: profile.avatarUrl }
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const ctx = await getSessionGardenContext()
  // Belt-and-suspenders with the middleware auth gate: no app UI without a
  // session. First-run gate: a signed-in user whose garden has no location
  // must set one first — a null location IS the flag (docs/architecture.md §24).
  if (!ctx) redirect('/login')
  if (!ctx.garden?.city) redirect('/welcome')

  const identity = toSidebarIdentity(ctx.profile)

  return (
    <ToastProvider>
      <div className="min-h-screen bg-surface-page">
        <AppSidebar identity={identity} />
        <main className="px-4 pb-20 md:ml-sidebar-offset md:mr-12 md:px-0 md:pb-0">
          {children}
        </main>
        <MobileTabBar />
      </div>
    </ToastProvider>
  )
}
