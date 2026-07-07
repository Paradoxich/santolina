import React from 'react'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'positive' | 'warning' | 'critical'
  children: React.ReactNode
}

const variantStyles: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: ['bg-surface-subtle', 'text-secondary', 'border-divider'].join(' '),
  positive: ['bg-surface-positive', 'text-positive', 'border-transparent'].join(
    ' '
  ),
  warning: ['bg-surface-warning', 'text-warning', 'border-transparent'].join(
    ' '
  ),
  critical: ['bg-surface-critical', 'text-critical', 'border-transparent'].join(
    ' '
  ),
}

export function Badge({
  variant = 'default',
  children,
  className = '',
  ...props
}: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center',
        'px-2.5 py-0.5',
        'text-xs font-medium',
        'rounded-full',
        'border',
        variantStyles[variant],
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </span>
  )
}

export default Badge
