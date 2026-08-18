import React from 'react'
import { cn } from '../utils/cn'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | 'primary'
    | 'secondary'
    | 'control'
    | 'ghost'
    | 'destructive'
    | 'destructive-ghost'
  /** Fixed heights: sm 32px, md 40px, lg 48px. */
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  ref?: React.Ref<HTMLButtonElement>
  children: React.ReactNode
}

const variantStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: [
    'bg-accent',
    'text-on-accent',
    'hover:bg-accent-hover',
    'focus-visible:ring-focus',
    'border-transparent',
  ].join(' '),
  secondary: [
    'bg-transparent',
    'text-accent',
    'border-accent',
    'hover:bg-surface-positive',
    'focus-visible:ring-focus',
  ].join(' '),
  control: [
    'bg-surface-control',
    'text-primary',
    'border-card',
    'hover:bg-surface-hover',
    'focus-visible:ring-focus',
  ].join(' '),
  ghost: [
    'bg-transparent',
    'text-secondary',
    'border-transparent',
    'hover:bg-surface-hover',
    'focus-visible:ring-focus',
  ].join(' '),
  destructive: [
    'bg-fill-critical',
    'text-on-accent',
    'border-transparent',
    'hover:bg-fill-critical-hover',
    'focus-visible:ring-critical',
  ].join(' '),
  'destructive-ghost': [
    'bg-transparent',
    'text-critical',
    'border-transparent',
    'hover:bg-surface-critical',
    'focus-visible:ring-critical',
  ].join(' '),
}

// Heights are fixed (32/40/48px) rather than padding-derived, matching what
// the app's hand-rolled buttons already do. Type stays text-body-small at
// every size — nothing in the app currently scales button text with height.
// Radius: 32 -> 8px, 40 & 48 -> 12px (lg does not step up to rounded-lg).
const sizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-8 px-item-gap text-body-small rounded-sm',
  md: 'h-10 px-row-gap text-body-small rounded-md',
  /* 24px has no semantic step — the scale goes 20 → 40 — and this is padding
   * inside a control rather than a gap, so it is a tier 3 measured value. */
  lg: 'h-12 px-button-padding-lg text-body-small rounded-md',
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  className,
  children,
  ref,
  ...props
}: ButtonProps) {
  const baseStyles = [
    'inline-flex items-center justify-center gap-inline-gap',
    'font-medium border',
    'transition-colors duration-normal',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    'cursor-pointer',
  ].join(' ')

  return (
    <button
      ref={ref}
      className={cn(
        baseStyles,
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      {...props}
    >
      {isLoading && (
        <span
          className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  )
}

export default Button
