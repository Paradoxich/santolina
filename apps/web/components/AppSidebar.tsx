'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

interface NavItem {
  label: string
  href: string
  icon: string
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: '/icons/icon-grid.svg' },
  { label: 'My Garden', href: '/garden', icon: '/icons/icon-leaf.svg' },
  { label: 'Plant Diary', href: '/diary', icon: '/icons/icon-diary.svg' },
  {
    label: 'Explore Plants',
    href: '/explore',
    icon: '/icons/icon-search.svg',
  },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed bottom-2 left-2 top-2 z-10 flex w-56 flex-col gap-[var(--space-section-gap)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-sidebar)] bg-[var(--color-background-sidebar)] p-[var(--space-inline-gap)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-15"
        style={{ backgroundImage: "url('/textures/sidebar-texture.png')" }}
      />

      <div className="relative p-[var(--space-row-gap)]">
        <Link href="/" className="inline-flex items-center gap-[6px]">
          <Image
            src="/logo-mark.svg"
            alt=""
            width={11}
            height={15}
            className="shrink-0"
          />
          <span className="text-[length:var(--font-size-logo)] font-medium tracking-[-0.05em] text-black">
            santolina
          </span>
        </Link>
      </div>

      <button
        type="button"
        className="relative flex w-full items-center gap-[var(--space-item-gap)] rounded-[var(--radius-md)] bg-[var(--color-background-overlay)] p-[var(--space-section-gap)] text-left shadow-[var(--shadow-soft)] transition-colors duration-[var(--duration-normal)] hover:bg-white/70"
      >
        <Image src="/icons/icon-agent.svg" alt="" width={16} height={16} />
        <span className="flex-1 text-[length:var(--font-size-body)] text-[var(--text-nav-label)]">
          Agent
        </span>
        <span className="text-[length:var(--font-size-label)] text-[var(--color-accent-primary)]">
          ⌘K
        </span>
      </button>

      <nav className="relative flex min-h-0 flex-1 flex-col gap-[var(--space-row-gap)]">
        <ul className="flex flex-1 flex-col gap-[var(--space-tight-gap)]">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'flex h-12 items-center gap-[var(--space-item-gap)] rounded-[var(--radius-sm)] pl-[var(--space-row-gap)] pr-2',
                    'text-[length:var(--font-size-body)] text-[var(--text-nav-label)]',
                    'transition-colors duration-[var(--duration-normal)]',
                    active
                      ? 'bg-[var(--color-background-active)]'
                      : 'hover:bg-[var(--color-background-overlay)]',
                  ].join(' ')}
                >
                  <Image src={item.icon} alt="" width={16} height={16} />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="flex items-center gap-[var(--space-inline-gap)] p-[var(--space-item-gap)]">
          <span className="flex size-6 items-center justify-center rounded-full bg-[var(--color-avatar-fill)] text-[length:var(--font-size-label)] text-[var(--text-image-label)]">
            PA
          </span>
          <span className="flex-1 text-[length:var(--font-size-body)] text-[var(--text-profile-name)]">
            Paradoxich
          </span>
        </div>
      </nav>
    </aside>
  )
}

export default AppSidebar
