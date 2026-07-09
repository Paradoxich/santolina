import React from 'react'
import { cn } from '../utils/cn'

export interface DetailRowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Left-hand label */
  label: string
  /** Right-hand value */
  value: React.ReactNode
  ref?: React.Ref<HTMLDivElement>
}

/**
 * A label/value row for definition-style lists. Draws a hairline
 * bottom border; stack rows directly to form a list.
 */
export function DetailRow({
  label,
  value,
  className,
  ref,
  ...props
}: DetailRowProps) {
  return (
    <div
      ref={ref}
      className={cn(
        'flex w-full items-start gap-row-gap',
        'border-b border-divider',
        'py-item-gap',
        className
      )}
      {...props}
    >
      <span className="w-[100px] shrink-0 text-label text-muted">{label}</span>
      <span className="min-w-0 flex-1 text-body text-primary">{value}</span>
    </div>
  )
}

export default DetailRow
