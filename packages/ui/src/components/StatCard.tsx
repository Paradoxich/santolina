import React from 'react'

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Short label shown in the card header */
  label: string
  /** Optional icon rendered at the right edge of the header */
  icon?: React.ReactNode
  /**
   * Background treatment.
   * - `neutral` — default recessed card
   * - `soft` — subtle card surface
   * - `caution` — warm background for warnings
   * - `positive` — green background for benefits
   */
  tone?: 'neutral' | 'soft' | 'caution' | 'positive'
  children: React.ReactNode
}

const toneStyles: Record<NonNullable<StatCardProps['tone']>, string> = {
  neutral: 'bg-[var(--color-background-page)]',
  soft: 'bg-[var(--color-background-card)]',
  caution: 'bg-[var(--color-background-caution-card)]',
  positive: 'bg-[var(--color-background-benefit-card)]',
}

/**
 * A small labelled stat/info card: header row with label and optional
 * icon, followed by body content.
 */
export function StatCard({
  label,
  icon,
  tone = 'neutral',
  className = '',
  children,
  ...props
}: StatCardProps) {
  return (
    <div
      className={[
        'flex flex-col gap-[var(--space-inline-gap)]',
        'rounded-[var(--radius-sm)] p-[var(--space-row-gap)]',
        toneStyles[tone],
        className,
      ].join(' ')}
      {...props}
    >
      <div className="flex w-full items-center justify-between gap-[var(--space-row-gap)]">
        <span className="min-w-0 flex-1 text-[length:var(--font-size-label)] text-[var(--text-stat-label)]">
          {label}
        </span>
        {icon && (
          <span
            aria-hidden="true"
            className="flex size-4 shrink-0 items-center justify-center"
          >
            {icon}
          </span>
        )}
      </div>
      <div className="w-full text-[length:var(--font-size-body-small)] leading-[1.3] tracking-[-0.01em] text-[var(--text-body-secondary)]">
        {children}
      </div>
    </div>
  )
}

export default StatCard
