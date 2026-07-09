import React from 'react'

export interface EmptyStateProps {
  message: string
  ctaLabel: string
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
}

const ctaClasses =
  'flex h-8 items-center justify-center rounded-sm bg-surface-subtle px-inline-gap text-body-small text-primary transition-colors duration-normal hover:bg-surface-control'

/**
 * Prominent, page-level empty state — a dashed panel with centered copy and a
 * single CTA. For low-emphasis inline empties (e.g. small cards), use plain
 * text rather than this.
 */
export function EmptyState({
  message,
  ctaLabel,
  ctaHref,
  linkComponent,
  onCtaClick,
  className = '',
}: EmptyStateProps) {
  const LinkComponent = linkComponent ?? 'a'

  return (
    <div
      className={`flex h-[404px] w-full flex-col items-center justify-center gap-section-gap rounded-md border border-dashed border-card p-card-padding ${className}`}
    >
      <p className="text-center text-body text-secondary">{message}</p>
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
  )
}

export default EmptyState
