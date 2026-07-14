import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { SideNav } from '@/components/design-system/SideNav'
import { TopTabBar } from '@/components/design-system/TopTabBar'
import { chapters } from '@/components/design-system/chapters'

export const metadata: Metadata = {
  title: 'Design System — Paradox UI',
  description:
    'Live token and component reference for Paradox UI. Code is the source of truth.',
}

export default function DesignSystemLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="border-b border-card lg:w-[240px] lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex flex-col gap-section-gap px-card-padding py-item-gap lg:sticky lg:top-0 lg:py-section-gap">
          <Link
            href="/design-system/overview"
            className="text-label uppercase tracking-label text-muted transition-colors hover:text-primary"
          >
            Design system
          </Link>
          <SideNav
            items={chapters.map(({ slug, label }) => ({ slug, label }))}
          />
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {/* TopTabBar renders its own full-width bar + bottom border (spanning
            sidebar edge to screen edge) and renders nothing at all for
            chapters without tabs — no stray line. */}
        <Suspense fallback={null}>
          <TopTabBar />
        </Suspense>
        <div className="px-card-padding py-section-gap lg:px-section-break lg:py-section-break">
          <div className="max-w-[960px]">{children}</div>
        </div>
      </main>
    </div>
  )
}
