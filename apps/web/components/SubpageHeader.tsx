import Link from 'next/link'
import { Icon } from '@paradoxui/ui'
import { icons } from '@/lib/icons'

interface SubpageHeaderProps {
  /** Destination for the back control. */
  backHref: string
  /** Visible label next to the back arrow (e.g. "Overview", "My Plants"). */
  backLabel: string
  /** Optional right-side actions (buttons, icon buttons). */
  children?: React.ReactNode
}

/**
 * Full-bleed top strip for subpages: back control on the left, optional
 * actions on the right. Spans the sidebar divider to the viewport edge by
 * cancelling the app shell gutters — same escape Garden, Explore, and plant
 * detail use. The back link is h-8 to match IconButton sm, so the strip
 * height stays the same with or without actions.
 */
export function SubpageHeader({
  backHref,
  backLabel,
  children,
}: SubpageHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-inline-gap border-b border-sage-200 py-4 md:ml-[calc(-1*var(--sidebar-offset))] md:mr-[calc(-1*var(--content-gutter))] md:pl-[var(--sidebar-offset)] md:pr-content-gutter">
      <Link
        href={backHref}
        className="flex h-8 items-center gap-tight-gap text-body text-secondary transition-colors duration-normal hover:text-primary"
      >
        <Icon src={icons.arrowRight} className="rotate-180" />
        {backLabel}
      </Link>
      {children ? (
        <div className="flex items-center gap-inline-gap">{children}</div>
      ) : null}
    </header>
  )
}

export default SubpageHeader
