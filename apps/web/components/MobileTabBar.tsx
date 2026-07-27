'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@paradoxui/ui'
import { icons, type IconName } from '@/lib/icons'

interface NavItem {
  label: string
  href: string
  icon: IconName
}

const navItems: NavItem[] = [
  { label: 'Overview', href: '/overview', icon: 'grid' },
  { label: 'My Plants', href: '/plants', icon: 'leaf' },
  { label: 'Explore', href: '/explore', icon: 'search' },
  { label: 'Reflections', href: '/reflections', icon: 'reflections' },
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
              active ? 'bg-surface-card-translucent' : '',
            ].join(' ')}
          >
            <Icon src={icons[item.icon]} />
          </Link>
        )
      })}
    </nav>
  )
}

export default MobileTabBar
