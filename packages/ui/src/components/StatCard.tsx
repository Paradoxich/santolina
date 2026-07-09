import React from 'react'
import { cn } from '../utils/cn'

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Short label shown in the card header */
  label: string
  /** Optional icon rendered at the right edge of the header */
  icon?: React.ReactNode
  /**
   * Background treatment.
   * - `neutral` — default recessed card
   * - `soft` — subtle card surface
   * - `warning` — warm background for warnings
   * - `positive` — green background for benefits
   */
  tone?: 'neutral' | 'soft' | 'warning' | 'positive'
  ref?: React.Ref<HTMLDivElement>
  children: React.ReactNode
}

const toneStyles: Record<NonNullable<StatCardProps['tone']>, string> = {
  neutral: 'bg-surface-sunken',
  soft: 'bg-surface-card',
  warning: 'bg-surface-warning',
  positive: 'bg-surface-positive',
}

/**
 * A small labelled stat/info card: header row with label and optional
 * icon, followed by body content.
 */
export function StatCard({
  label,
  icon,
  tone = 'neutral',
  className,
  ref,
  children,
  ...props
}: StatCardProps) {
  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-col gap-inline-gap',
        'rounded-sm p-row-gap',
        toneStyles[tone],
        className
      )}
      {...props}
    >
      <div className="flex w-full items-center justify-between gap-row-gap">
        <span className="min-w-0 flex-1 text-label text-primary">{label}</span>
        {icon && (
          <span
            aria-hidden="true"
            className="flex size-4 shrink-0 items-center justify-center"
          >
            {icon}
          </span>
        )}
      </div>
      <div className="w-full text-body-small text-body-secondary">
        {children}
      </div>
    </div>
  )
}

export default StatCard
