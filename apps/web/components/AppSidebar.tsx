'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Avatar, Badge, Icon, Menu } from '@paradoxui/ui'
import { icons, type IconName } from '@/lib/icons'
import { SettingsModal } from '@/components/SettingsModal'
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
}

// The avatar is deliberately larger than the nav icons, so every row's glyph
// sits in an avatar-wide slot. That keeps the icons centred on the avatar's
// axis and starts every label at the same x.
const glyphSlot = 'flex w-6 shrink-0 justify-center'

const navItems: NavItem[] = [
  { label: 'Overview', href: '/overview', icon: 'grid' },
  { label: 'My Plants', href: '/plants', icon: 'leaf' },
  { label: 'Diary', href: '/diary', icon: 'diary' },
  { label: 'Explore', href: '/explore', icon: 'search' },
  { label: 'Reflections', href: '/reflections', icon: 'reflections' },
]

export function AppSidebar({ identity }: { identity: SidebarIdentity }) {
  const pathname = usePathname()
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <aside className="fixed inset-y-0 left-0 z-10 hidden w-sidebar flex-col border-r border-[var(--sidebar-divider)] bg-surface-page md:flex">
      {/* Inline-gap here plus row-gap on the trigger matches the nav's own
          8 + 16, so the avatar starts where the icon slots below do — and it
          gives the hover fill room. */}
      <div className="px-inline-gap py-row-gap">
        <Menu
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
              label: 'Log out',
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

      <button
        type="button"
        disabled
        className="flex h-14 shrink-0 items-center gap-inline-gap border-t border-[var(--sidebar-divider)] px-card-padding py-inline-gap text-left opacity-50"
      >
        <span className={glyphSlot}>
          <Icon src={icons.agent} />
        </span>
        <span className="flex-1 text-body text-primary">Agent</span>
        <span className="text-label text-accent">⌘K</span>
      </button>

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
