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
  { label: 'Garden', href: '/garden', icon: '/icons/icon-leaf.svg' },
  { label: 'Diary', href: '/diary', icon: '/icons/icon-diary.svg' },
  { label: 'Explore', href: '/explore', icon: '/icons/icon-search.svg' },
]

export function MobileTabBar() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Primary"
      style={{
        bottom: 'max(var(--space-row-gap), env(safe-area-inset-bottom))',
        // Tailwind's backdrop-blur utility isn't autoprefixed for Safari;
        // iOS needs the -webkit- form to actually render the blur.
        WebkitBackdropFilter: 'blur(12px)',
      }}
      className="fixed left-1/2 z-10 flex h-14 w-fit -translate-x-1/2 items-stretch gap-inline-gap overflow-hidden rounded-full border border-card-translucent bg-[var(--sidebar-surface)] p-tight-gap shadow-lg backdrop-blur-md md:hidden"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-15"
        style={{ backgroundImage: "url('/textures/sidebar-texture.png')" }}
      />

      {navItems.map((item) => {
        const active = pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={active ? 'page' : undefined}
            className={[
              'flex w-16 items-center justify-center rounded-full',
              active ? 'bg-accent-muted' : '',
            ].join(' ')}
          >
            <Image src={item.icon} alt="" width={16} height={16} />
          </Link>
        )
      })}

      <button
        type="button"
        aria-label="Open agent"
        className="flex w-16 items-center justify-center rounded-full"
      >
        <Image src="/icons/icon-agent.svg" alt="" width={16} height={16} />
      </button>
    </nav>
  )
}

export default MobileTabBar
