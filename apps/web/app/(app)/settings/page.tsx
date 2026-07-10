import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getSessionGardenContext } from '@/lib/session-garden'
import { AccountSettings } from '@/components/AccountSettings'

export const metadata: Metadata = {
  title: 'Account settings',
}

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const ctx = await getSessionGardenContext()
  if (!ctx) redirect('/login')

  return (
    <AccountSettings
      email={ctx.profile.email}
      city={ctx.garden?.city ?? null}
      country={ctx.garden?.country ?? null}
    />
  )
}
