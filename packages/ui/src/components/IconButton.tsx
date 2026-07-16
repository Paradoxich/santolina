import React from 'react'
import { cn } from '../utils/cn'

export interface IconButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label'
> {
  variant?:
    | 'primary'
    | 'control'
    | 'ghost'
    | 'destructive'
    | 'destructive-ghost'
  /** Fixed square sizes: sm 32px, md 40px, lg 48px. */
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  ref?: React.Ref<HTMLButtonElement>
  /** Icon-only — always required so the control has an accessible name. */
  'aria-label': string
  children: React.ReactNode
}

// Icon assets are <img>-loaded SVGs with a hardcoded stroke color, so they
// can't pick up text-on-accent via currentColor the way an inline SVG would.
// Filtering to white is the pragmatic fix for the two filled/on-accent
// variants — every current icon is single-color line art, so this is safe.
const onAccentIconFilter = '[&_img]:brightness-0 [&_img]:invert'

// Shares Button's variant vocabulary so the two read as one system — only
// shape differs (icon-only square vs. labeled pill).
const variantStyles: Record<NonNullable<IconButtonProps['variant']>, string> = {
  primary: [
    'bg-accent',
    'text-on-accent',
    'hover:bg-accent-hover',
    'focus-visible:ring-focus',
    'border-transparent',
    onAccentIconFilter,
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
    onAccentIconFilter,
  ].join(' '),
  'destructive-ghost': [
    'bg-transparent',
    'text-critical',
    'border-transparent',
    'hover:bg-surface-critical',
    'focus-visible:ring-critical',
  ].join(' '),
}

// Radius is fixed at rounded-sm (8px) for every size — unifies what used to
// be a mix of rounded-full and an arbitrary rounded-[6px] across the app.
const sizeStyles: Record<NonNullable<IconButtonProps['size']>, string> = {
  sm: 'size-8 rounded-sm',
  md: 'size-10 rounded-sm',
  lg: 'size-12 rounded-sm',
}

export function IconButton({
  variant = 'control',
  size = 'sm',
  isLoading = false,
  disabled,
  className,
  children,
  ref,
  ...props
}: IconButtonProps) {
  const baseStyles = [
    'inline-flex shrink-0 items-center justify-center',
    'border',
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
      {isLoading ? (
        <span
          className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : (
        children
      )}
    </button>
  )
}

export default IconButton
