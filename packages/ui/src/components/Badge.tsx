import React from 'react'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info'
  children: React.ReactNode
}

const variantStyles: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: [
    'bg-[var(--color-neutral-100)]',
    'text-[var(--color-neutral-700)]',
    'border-[var(--color-neutral-200)]',
  ].join(' '),
  success: [
    'bg-[var(--color-success-100)]',
    'text-[var(--color-success-700)]',
    'border-[var(--color-success-200)]',
  ].join(' '),
  warning: [
    'bg-[var(--color-warning-100)]',
    'text-[var(--color-warning-700)]',
    'border-[var(--color-warning-200)]',
  ].join(' '),
  error: [
    'bg-[var(--color-error-100)]',
    'text-[var(--color-error-700)]',
    'border-[var(--color-error-200)]',
  ].join(' '),
  info: [
    'bg-[var(--color-info-100)]',
    'text-[var(--color-info-700)]',
    'border-[var(--color-info-200)]',
  ].join(' '),
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
        'rounded-[var(--radius-full)]',
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
