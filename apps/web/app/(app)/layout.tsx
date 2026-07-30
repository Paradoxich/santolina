import { redirect } from 'next/navigation'
import { ToastProvider } from '@paradoxui/ui'
import { AppSidebar, type SidebarIdentity } from '@/components/AppSidebar'
import { AddNoteProvider } from '@/components/AddNoteProvider'
import { DemoBanner } from '@/components/DemoBanner'
import { MobileTabBar } from '@/components/MobileTabBar'
import {
  getSessionGardenContext,
  type SessionProfile,
} from '@/lib/session-garden'

function toSidebarIdentity(
  profile: SessionProfile,
  garden: { city: string | null; country: string | null } | null,
  isAnonymous: boolean
): SidebarIdentity {
  const name = profile.displayName?.trim() || profile.email || 'Your account'
  return {
    name,
    avatarUrl: profile.avatarUrl,
    email: profile.email,
    city: garden?.city ?? null,
    country: garden?.country ?? null,
    isAnonymous,
  }
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const ctx = await getSessionGardenContext()
  // Belt-and-suspenders with the middleware auth gate: no app UI without a
  // session. First-run gate: a signed-in user whose garden has no location
  // must set one first — a null location IS the flag (docs/architecture.md#auth).
  if (!ctx) redirect('/login')
  if (!ctx.garden?.city) redirect('/welcome')

  const identity = toSidebarIdentity(ctx.profile, ctx.garden, ctx.isAnonymous)

  return (
    <ToastProvider>
      <AddNoteProvider>
        {/* The demo bar spans the full width above everything, so the sidebar
            has to start below it: --app-chrome-top is the sidebar's top inset,
            and it must stay in step with the bar's own height (py-3 + one line
            of body-small). Unset for a normal session, where the sidebar falls
            back to a 0 inset and nothing moves. */}
        <div
          className="min-h-screen bg-surface-page"
          style={
            ctx.isAnonymous
              ? ({ '--app-chrome-top': '2.75rem' } as React.CSSProperties)
              : undefined
          }
        >
          {ctx.isAnonymous && <DemoBanner />}
          <AppSidebar identity={identity} />
          <main className="px-4 pb-20 md:ml-sidebar-offset md:mr-content-gutter md:px-0 md:pb-0">
            {children}
          </main>
          <MobileTabBar />
        </div>
      </AddNoteProvider>
    </ToastProvider>
  )
}
