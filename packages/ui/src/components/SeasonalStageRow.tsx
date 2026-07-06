import React from 'react'

export interface SeasonalStageRowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Short stage label shown in the narrow left column */
  stage: string
  /** Description of what happens during this stage */
  children: React.ReactNode
}

/**
 * A row in a stage/timeline list: narrow stage label on the left,
 * description on the right. Draws a hairline bottom border.
 */
export function SeasonalStageRow({
  stage,
  className = '',
  children,
  ...props
}: SeasonalStageRowProps) {
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
      <span className="w-12 shrink-0 text-[length:var(--font-size-label)] text-[var(--text-step-label)]">
        {stage}
      </span>
      <span className="min-w-0 flex-1 text-[length:var(--font-size-body)] leading-[1.3] text-[var(--text-list-description)]">
        {children}
      </span>
    </div>
  )
}

export default SeasonalStageRow
