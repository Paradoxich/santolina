import React from 'react'
import { cn } from '../utils/cn'

export interface DetailRowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Left-hand label */
  label: string
  /** Right-hand value */
  value: React.ReactNode
  /**
   * Width of the label column. 'md' suits word-length labels;
   * 'sm' suits short stage/step labels in timeline-style lists.
   */
  labelWidth?: 'sm' | 'md'
  ref?: React.Ref<HTMLDivElement>
}

/**
 * A label/value row for definition-style lists. Draws a hairline
 * bottom border; stack rows directly to form a list.
 */
export function DetailRow({
  label,
  value,
  labelWidth = 'md',
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
      <span
        className={cn(
          'shrink-0 text-label text-muted',
          labelWidth === 'sm' ? 'w-12' : 'w-[100px]'
        )}
      >
        {label}
      </span>
      <span className="min-w-0 flex-1 text-body text-primary">{value}</span>
    </div>
  )
}

export default DetailRow
