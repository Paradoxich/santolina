'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Avatar, Badge, Icon, Menu } from '@paradoxui/ui'
import { icons, type IconName } from '@/lib/icons'
import { SettingsModal } from '@/components/SettingsModal'
import { useAddNote } from '@/components/AddNoteProvider'
import { signOut } from '@/server/account-actions'

interface NavItem {
  label: string
  href: string
  icon: IconName
}

export interface SidebarIdentity {
  name: string
  avatarUrl: string | null
  email: string | null
  city: string | null
  country: string | null
  /**
   * A demo visitor (anonymous account). Only changes the sign-out label: an
   * anonymous session cannot be signed back into, so "Log out" would promise a
   * way back that does not exist. The abandoned account is cleaned up by
   * scripts/purge-demo-users.ts.
   */
  isAnonymous: boolean
}

// The avatar is deliberately larger than the nav icons, so every row's glyph
// sits in an avatar-wide slot. That keeps the icons centred on the avatar's
// axis and starts every label at the same x.
const glyphSlot = 'flex w-6 shrink-0 justify-center'

const navItems: NavItem[] = [
  { label: 'Overview', href: '/overview', icon: 'grid' },
  { label: 'My Plants', href: '/plants', icon: 'leaf' },
  { label: 'Explore', href: '/explore', icon: 'search' },
  { label: 'Reflections', href: '/reflections', icon: 'reflections' },
]

export function AppSidebar({ identity }: { identity: SidebarIdentity }) {
  const pathname = usePathname()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { openAddNote } = useAddNote()

  return (
    // Starts below any full-width chrome pinned above the app (today: the demo
    // bar, which sets --app-chrome-top). Defaults to 0, so with no chrome the
    // sidebar is flush to the top exactly as before.
    <aside className="fixed bottom-0 left-0 top-[var(--app-chrome-top,0px)] z-10 hidden w-sidebar flex-col border-r border-[var(--sidebar-divider)] bg-surface-page md:flex">
      {/* Inline-gap here plus row-gap on the trigger matches the nav's own
          8 + 16, so the avatar starts where the icon slots below do — and it
          gives the hover fill room. */}
      <div className="px-inline-gap py-row-gap">
        <Menu
          intent="actions"
          label="Your account"
          align="start"
          className="w-full"
          // Panel spans the trigger, so the dropdown reads as part of the row
          // it drops from rather than a narrow tag beside it.
          menuClassName="w-full"
          triggerClassName="flex w-full items-center gap-inline-gap rounded-md px-row-gap py-item-gap text-left transition-colors duration-normal hover:bg-surface-nav-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          items={[
            {
              label: 'Settings',
              icon: <Icon src={icons.settings} />,
              onSelect: () => setSettingsOpen(true),
            },
            {
              label: identity.isAnonymous ? 'End demo' : 'Log out',
              icon: <Icon src={icons.logout} />,
              onSelect: () => signOut(),
            },
          ]}
          trigger={
            <>
              <Avatar
                size="xs"
                src={identity.avatarUrl ?? undefined}
                alt={identity.name}
              />
              <span className="flex-1 truncate text-body text-primary">
                {identity.name}
              </span>
              <Badge className="shrink-0 whitespace-nowrap border-transparent bg-honey-300 uppercase tracking-wide text-honey-600">
                WIP
              </Badge>
            </>
          }
        />
      </div>

      {/* An action, not a destination — same row chrome as the nav links
          below, with a filled plus so it still reads as "do" rather than "go". */}
      <div className="px-inline-gap pb-inline-gap">
        <button
          type="button"
          onClick={openAddNote}
          className={[
            'flex w-full items-center gap-inline-gap rounded-md px-row-gap py-item-gap',
            'text-body text-primary',
            'transition-colors duration-normal hover:bg-surface-nav-active',
          ].join(' ')}
        >
          <span className={glyphSlot}>
            <Icon src={icons.plusFilled} />
          </span>
          Add note
        </button>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-tight-gap p-inline-gap">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={[
                'flex items-center gap-inline-gap rounded-md px-row-gap py-item-gap',
                'text-body text-primary',
                'transition-colors duration-normal',
                active
                  ? 'bg-surface-nav-active'
                  : 'hover:bg-surface-nav-active',
              ].join(' ')}
            >
              <span className={glyphSlot}>
                <Icon src={icons[item.icon]} />
              </span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        email={identity.email}
        city={identity.city}
        country={identity.country}
      />
    </aside>
  )
}

export default AppSidebar
