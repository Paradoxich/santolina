import React from 'react'

export interface PanelProps extends React.HTMLAttributes<HTMLElement> {
  /** Panel heading shown at the top left */
  title?: string
  /** Secondary text shown at the top right, baseline-aligned with the title */
  meta?: string
  children: React.ReactNode
}

/**
 * A dashboard panel: soft card surface with a translucent border, large
 * radius, and an optional header row (title left, meta right).
 */
export function Panel({
  title,
  meta,
  className = '',
  children,
  ...props
}: PanelProps) {
  return (
    <section
      className={[
        'flex flex-col gap-[var(--space-section-gap)]',
        'rounded-[var(--component-card-dashboard-radius)]',
        'border border-[var(--color-border-card-translucent)]',
        'bg-[var(--color-background-card)] p-[var(--space-card-padding)]',
        className,
      ].join(' ')}
      {...props}
    >
      {(title || meta) && (
        <div className="flex w-full items-baseline justify-between gap-[var(--space-row-gap)]">
          {title && (
            <h2 className="min-w-0 flex-1 text-[length:var(--font-size-section-title)] font-medium tracking-[-0.02em] text-[var(--text-panel-title)]">
              {title}
            </h2>
          )}
          {meta && (
            <span className="shrink-0 whitespace-nowrap text-[length:var(--font-size-body)] text-[var(--text-meta)]">
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
