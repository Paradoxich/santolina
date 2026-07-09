import React from 'react'
import { cn } from '../utils/cn'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Stylistic kind. Use `tone` for semantic status. */
  variant?: 'default' | 'accent'
  /** Semantic status. Takes precedence over `variant` when set. */
  tone?: 'positive' | 'warning' | 'critical'
  ref?: React.Ref<HTMLSpanElement>
  children: React.ReactNode
}

const variantStyles: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: ['bg-surface-subtle', 'text-secondary', 'border-divider'].join(' '),
  accent: ['bg-accent-muted', 'text-accent', 'border-transparent'].join(' '),
}

const toneStyles: Record<NonNullable<BadgeProps['tone']>, string> = {
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
  tone,
  children,
  className,
  ref,
  ...props
}: BadgeProps) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center',
        'px-2.5 py-0.5',
        'text-xs font-medium',
        'rounded-full',
        'border',
        tone ? toneStyles[tone] : variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}

export default Badge
