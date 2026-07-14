import React from 'react'
import { cn } from '../utils/cn'

export interface EmptyStateProps {
  message: string
  ctaLabel: string
  /**
   * Optional illustration rendered inside the tile above the message — an
   * inline SVG or `<img>`. Decorative by contract: the message carries the
   * meaning, so pass `aria-hidden="true"` (or an empty `alt`) on the element
   * itself. It fills the tile, which supplies the background and clipping.
   */
  illustration?: React.ReactNode
  /**
   * Navigation target for the CTA. Rendered through `linkComponent`
   * (a plain `<a>` by default). For in-page actions use `onCtaClick` instead.
   */
  ctaHref?: string
  /**
   * Framework link component used to render `ctaHref` — e.g. Next's `Link`.
   * Defaults to a plain `<a>` so the kit carries no framework dependency.
   */
  linkComponent?: React.ElementType
  onCtaClick?: () => void
  className?: string
  ref?: React.Ref<HTMLDivElement>
}

const ctaClasses =
  'flex h-8 shrink-0 items-center justify-center rounded-sm bg-accent px-inline-gap text-body-small text-on-accent transition-colors duration-normal hover:bg-accent-hover'

/**
 * Prominent, page-level empty state — a dashed panel holding a contained
 * illustration tile, with the message and a single CTA in a row beneath it.
 * For low-emphasis inline empties (e.g. small cards) use plain text instead.
 */
export function EmptyState({
  message,
  ctaLabel,
  illustration,
  ctaHref,
  linkComponent,
  onCtaClick,
  className,
  ref,
}: EmptyStateProps) {
  const LinkComponent = linkComponent ?? 'a'

  return (
    <div
      ref={ref}
      className={cn(
        'flex w-full max-w-[411px] flex-col gap-section-gap rounded-md border border-dashed border-card p-card-padding',
        className
      )}
    >
      {illustration && (
        <div className="relative aspect-[726/557] w-full overflow-hidden rounded-md bg-surface-subtle">
          {illustration}
        </div>
      )}
      <div className="flex items-center justify-between gap-row-gap">
        <p className="text-body-small text-secondary">{message}</p>
        {ctaHref ? (
          <LinkComponent href={ctaHref} className={ctaClasses}>
            {ctaLabel}
          </LinkComponent>
        ) : (
          <button type="button" onClick={onCtaClick} className={ctaClasses}>
            {ctaLabel}
          </button>
        )}
      </div>
    </div>
  )
}

export default EmptyState
