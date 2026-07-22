'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Tabs } from '@paradoxui/ui'
import { chapters } from './chapters'

/**
 * The active chapter's subcategory tabs, rendered in the layout's full-width
 * top bar rather than inside the page — so the row (and its bottom border)
 * genuinely spans the page edge to edge, not just the padded content column.
 * Reads the current chapter/section from the URL directly rather than via
 * props, since a layout doesn't receive params from the dynamic segment
 * below it.
 */
export function TopTabBar() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  const slug = pathname.split('/')[2]
  const chapter = chapters.find((c) => c.slug === slug)
  if (!chapter || chapter.sections.length <= 1) return null

  const activeSlug = searchParams.get('s') ?? chapter.sections[0]!.slug

  // The whole bar (padding + bottom border) renders here, not in the layout,
  // so tab-less chapters get no stray line. No bottom padding: the active
  // tab's underline must sit directly on the border.
  return (
    <div className="border-b border-card px-card-padding pt-item-gap lg:px-section-break lg:pt-section-gap">
      {/* no-scrollbar: overflow-x-auto forces overflow-y to compute to auto,
          and the active tab's 1px underline (after:-bottom-px) overflows just
          enough to summon a stray fern-green vertical scrollbar. Hide it —
          horizontal scroll still works, the underline is untouched. */}
      <div className="no-scrollbar overflow-x-auto">
        <Tabs
          items={chapter.sections.map(({ slug: s, label }) => ({
            value: s,
            label,
          }))}
          value={activeSlug}
          onChange={(value) =>
            router.replace(`${pathname}?s=${value}`, { scroll: false })
          }
        />
      </div>
    </div>
  )
}

export default TopTabBar
