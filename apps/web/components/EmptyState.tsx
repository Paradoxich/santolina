import Link from 'next/link'

interface EmptyStateProps {
  message: string
  ctaLabel: string
  /** Link target. For in-page actions (e.g. switching tabs) use onCtaClick instead. */
  ctaHref?: string
  onCtaClick?: () => void
  className?: string
}

const ctaClasses =
  'flex h-8 items-center justify-center rounded-sm bg-surface-subtle px-inline-gap text-body-small text-primary transition-colors duration-normal hover:bg-surface-control'

/**
 * Prominent page-level empty state — dashed panel with centered copy and a
 * real CTA. Matches the Figma "Screen / Empty state" frame (568:2807).
 * Dashboard cards use small inline text instead, not this.
 */
export function EmptyState({
  message,
  ctaLabel,
  ctaHref,
  onCtaClick,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex h-[404px] w-full flex-col items-center justify-center gap-section-gap rounded-md border border-dashed border-card p-card-padding ${className}`}
    >
      <p className="text-center text-body text-secondary">{message}</p>
      {ctaHref ? (
        <Link href={ctaHref} className={ctaClasses}>
          {ctaLabel}
        </Link>
      ) : (
        <button type="button" onClick={onCtaClick} className={ctaClasses}>
          {ctaLabel}
        </button>
      )}
    </div>
  )
}

export default EmptyState
