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
        'flex w-full items-start gap-row-gap',
        'border-b border-divider',
        'py-item-gap',
        className,
      ].join(' ')}
      {...props}
    >
      <span className="w-12 shrink-0 text-label text-muted">{stage}</span>
      <span className="min-w-0 flex-1 text-body text-primary">{children}</span>
    </div>
  )
}

export default SeasonalStageRow
