'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@paradoxui/ui'

export interface SideNavItem {
  slug: string
  label: string
}

/**
 * Chapter navigation for the design-system docs shell. Vertical and sticky
 * on desktop; a horizontal scrollable row above the content on mobile.
 */
export function SideNav({ items }: { items: SideNavItem[] }) {
  const pathname = usePathname()

  return (
    <nav aria-label="Design system chapters">
      <ul
        role="list"
        className="flex gap-tight-gap overflow-x-auto lg:flex-col lg:overflow-visible"
      >
        {items.map(({ slug, label }) => {
          const href = `/design-system/${slug}`
          const active = pathname === href
          return (
            <li key={slug} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'block whitespace-nowrap rounded-sm px-item-gap py-inline-gap text-body-small transition-colors',
                  active
                    ? 'bg-surface-hover font-medium text-primary'
                    : 'text-secondary hover:bg-surface-hover hover:text-primary'
                )}
              >
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export default SideNav
