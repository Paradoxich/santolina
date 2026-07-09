import React from 'react'
import { cn } from '../utils/cn'

export interface PanelProps extends React.HTMLAttributes<HTMLElement> {
  /** Panel heading shown at the top left */
  title?: string
  /** Secondary text shown at the top right, baseline-aligned with the title */
  meta?: string
  ref?: React.Ref<HTMLElement>
  children: React.ReactNode
}

/**
 * A dashboard panel: soft card surface with a translucent border, large
 * radius, and an optional header row (title left, meta right).
 */
export function Panel({
  title,
  meta,
  className,
  ref,
  children,
  ...props
}: PanelProps) {
  return (
    <section
      ref={ref}
      className={cn(
        'flex flex-col gap-section-gap',
        'rounded-card-dashboard',
        'border border-card-translucent',
        'bg-surface-card p-card-padding',
        className
      )}
      {...props}
    >
      {(title || meta) && (
        <div className="flex w-full items-baseline justify-between gap-row-gap">
          {title && (
            <h2 className="min-w-0 flex-1 text-section font-medium text-primary">
              {title}
            </h2>
          )}
          {meta && (
            <span className="shrink-0 whitespace-nowrap text-body text-muted">
              {meta}
            </span>
          )}
        </div>
      )}
      {children}
    </section>
  )
}

export default Panel
