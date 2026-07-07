import React from 'react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
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
}

const sizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-md',
  md: 'px-4 py-2 text-base rounded-md',
  lg: 'px-6 py-3 text-lg rounded-lg',
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  const baseStyles = [
    'inline-flex items-center justify-center gap-2',
    'font-medium border',
    'transition-colors duration-normal',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    'cursor-pointer',
  ].join(' ')

  return (
    <button
      className={[
        baseStyles,
        variantStyles[variant],
        sizeStyles[size],
        className,
      ].join(' ')}
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
