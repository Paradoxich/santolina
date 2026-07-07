'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Icon } from '@paradoxui/ui'
import { icons, type IconName } from '@/lib/icons'

interface NavItem {
  label: string
  href: string
  icon: IconName
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: 'grid' },
  { label: 'My Garden', href: '/garden', icon: 'leaf' },
  { label: 'Plant Diary', href: '/diary', icon: 'diary' },
  { label: 'Explore Plants', href: '/explore', icon: 'search' },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed bottom-2 left-2 top-2 z-10 hidden w-56 flex-col gap-section-gap overflow-hidden rounded-md border border-card-translucent bg-[var(--sidebar-surface)] p-inline-gap md:flex">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-15"
        style={{ backgroundImage: "url('/textures/sidebar-texture.png')" }}
      />

      <div className="relative p-row-gap">
        <Link href="/" className="inline-flex items-center gap-[6px]">
          <Image
            src="/logo-mark.svg"
            alt=""
            width={11}
            height={15}
            className="shrink-0"
          />
          <span className="text-base font-medium tracking-[-0.05em] text-primary">
            santolina
          </span>
        </Link>
      </div>

      <button
        type="button"
        className="relative flex w-full items-center gap-item-gap rounded-md border border-dashed border-accent bg-surface-active p-section-gap text-left transition-colors duration-normal hover:bg-green-300"
      >
        <Icon src={icons.agent} />
        <span className="flex-1 text-body text-primary">Agent</span>
        <span className="text-label text-accent">⌘K</span>
      </button>

      <nav className="relative flex min-h-0 flex-1 flex-col gap-row-gap">
        <ul className="flex flex-1 flex-col gap-tight-gap">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'flex h-12 items-center gap-item-gap rounded-sm pl-row-gap pr-2',
                    'text-body text-primary',
                    'transition-colors duration-normal',
                    active
                      ? 'bg-surface-card-translucent'
                      : 'hover:bg-surface-overlay',
                  ].join(' ')}
                >
                  <Icon src={icons[item.icon]} />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="flex items-center gap-inline-gap p-item-gap">
          <span className="flex size-6 items-center justify-center rounded-full bg-[var(--avatar-fill)] text-label text-inverse">
            PA
          </span>
          <span className="flex-1 text-body text-primary">Paradoxich</span>
        </div>
      </nav>
    </aside>
  )
}

export default AppSidebar
