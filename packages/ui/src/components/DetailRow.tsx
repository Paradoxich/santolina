import React from 'react'

export interface DetailRowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Left-hand label */
  label: string
  /** Right-hand value */
  value: React.ReactNode
}

/**
 * A label/value row for definition-style lists. Draws a hairline
 * bottom border; stack rows directly to form a list.
 */
export function DetailRow({
  label,
  value,
  className = '',
  ...props
}: DetailRowProps) {
  return (
    <div
      className={[
        'flex w-full items-start gap-[var(--space-row-gap)]',
        'border-b border-[var(--color-border-divider)]',
        'py-[var(--space-item-gap)]',
        className,
      ].join(' ')}
      {...props}
    >
      <span className="w-[100px] shrink-0 text-[length:var(--font-size-label)] text-[var(--text-label)]">
        {label}
      </span>
      <span className="min-w-0 flex-1 text-[length:var(--font-size-body)] leading-[1.3] text-[var(--text-stat-value)]">
        {value}
      </span>
    </div>
  )
}

export default DetailRow
