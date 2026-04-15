import React from 'react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  children: React.ReactNode
}

const variantStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: [
    'bg-[var(--color-primary-600)]',
    'text-white',
    'hover:bg-[var(--color-primary-700)]',
    'focus-visible:ring-[var(--color-primary-500)]',
    'border-transparent',
  ].join(' '),
  secondary: [
    'bg-transparent',
    'text-[var(--color-primary-700)]',
    'border-[var(--color-primary-300)]',
    'hover:bg-[var(--color-primary-50)]',
    'focus-visible:ring-[var(--color-primary-500)]',
  ].join(' '),
  ghost: [
    'bg-transparent',
    'text-[var(--color-neutral-700)]',
    'border-transparent',
    'hover:bg-[var(--color-neutral-100)]',
    'focus-visible:ring-[var(--color-neutral-400)]',
  ].join(' '),
  destructive: [
    'bg-[var(--color-error-600)]',
    'text-white',
    'border-transparent',
    'hover:bg-[var(--color-error-700)]',
    'focus-visible:ring-[var(--color-error-500)]',
  ].join(' '),
}

const sizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-[var(--radius-md)]',
  md: 'px-4 py-2 text-base rounded-[var(--radius-md)]',
  lg: 'px-6 py-3 text-lg rounded-[var(--radius-lg)]',
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
    'transition-colors duration-[var(--duration-normal)]',
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
