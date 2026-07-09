import React from 'react'
import { cn } from '../utils/cn'

export interface SeasonalStageRowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Short stage label shown in the narrow left column */
  stage: string
  ref?: React.Ref<HTMLDivElement>
  /** Description of what happens during this stage */
  children: React.ReactNode
}

/**
 * A row in a stage/timeline list: narrow stage label on the left,
 * description on the right. Draws a hairline bottom border.
 */
export function SeasonalStageRow({
  stage,
  className,
  ref,
  children,
  ...props
}: SeasonalStageRowProps) {
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
      <span className="w-12 shrink-0 text-label text-muted">{stage}</span>
      <span className="min-w-0 flex-1 text-body text-primary">{children}</span>
    </div>
  )
}

export default SeasonalStageRow
