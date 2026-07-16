'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Avatar, Badge, Icon } from '@paradoxui/ui'
import { icons, type IconName } from '@/lib/icons'

interface NavItem {
  label: string
  href: string
  icon: IconName
}

export interface SidebarIdentity {
  name: string
  avatarUrl: string | null
}

const navItems: NavItem[] = [
  { label: 'Overview', href: '/overview', icon: 'grid' },
  { label: 'My Plants', href: '/plants', icon: 'leaf' },
  { label: 'Diary', href: '/diary', icon: 'diary' },
  { label: 'Explore', href: '/explore', icon: 'search' },
]

export function AppSidebar({ identity }: { identity: SidebarIdentity }) {
  const pathname = usePathname()

  return (
    <aside className="fixed bottom-2 left-2 top-2 z-10 hidden w-sidebar flex-col overflow-hidden rounded-md border border-card-translucent bg-[var(--sidebar-surface)] md:flex">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-15"
        style={{ backgroundImage: "url('/textures/sidebar-texture.png')" }}
      />

      <Link
        href="/settings"
        aria-current={pathname.startsWith('/settings') ? 'page' : undefined}
        className="relative flex items-center gap-inline-gap px-section-gap py-row-gap"
      >
        <Avatar
          size="xs"
          src={identity.avatarUrl ?? undefined}
          alt={identity.name}
        />
        <span className="flex-1 truncate text-body text-primary">
          {identity.name}
        </span>
        <Badge
          tone="positive"
          className="shrink-0 whitespace-nowrap uppercase tracking-wide"
        >
          WIP
        </Badge>
      </Link>

      <nav className="relative flex min-h-0 flex-1 flex-col gap-tight-gap p-inline-gap">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={[
                'flex items-center gap-item-gap rounded-md p-row-gap',
                'text-body text-primary',
                'transition-colors duration-normal',
                active
                  ? 'bg-surface-nav-active'
                  : 'hover:bg-surface-nav-active',
              ].join(' ')}
            >
              <Icon src={icons[item.icon]} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <button
        type="button"
        className="relative flex h-14 shrink-0 items-center gap-item-gap border-t border-card-translucent px-section-gap py-inline-gap text-left transition-colors duration-normal hover:bg-surface-nav-active"
      >
        <Icon src={icons.agent} />
        <span className="flex-1 text-body text-primary">Agent</span>
        <span className="text-label text-accent">⌘K</span>
      </button>
    </aside>
  )
}

export default AppSidebar
