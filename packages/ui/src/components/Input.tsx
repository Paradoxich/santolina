import React from 'react'
import { cn } from '../utils/cn'
import { FormError } from './FormError'

export interface InputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'size'
> {
  variant?: 'default' | 'error'
  label?: string
  helperText?: string
  errorMessage?: string
  size?: 'sm' | 'md' | 'lg'
  ref?: React.Ref<HTMLInputElement>
}

const variantStyles: Record<NonNullable<InputProps['variant']>, string> = {
  default: ['border-divider', 'focus:border-accent', 'focus:ring-focus'].join(
    ' '
  ),
  error: [
    'border-critical',
    'focus:border-critical',
    'focus:ring-critical',
  ].join(' '),
}

const sizeStyles: Record<NonNullable<InputProps['size']>, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-md',
  md: 'px-3 py-2 text-base rounded-md',
  lg: 'px-4 py-3 text-lg rounded-lg',
}

export function Input({
  variant = 'default',
  label,
  helperText,
  errorMessage,
  size = 'md',
  id,
  className,
  ref,
  ...props
}: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  const helperId = inputId ? `${inputId}-helper` : undefined
  const errorId = inputId ? `${inputId}-error` : undefined

  const baseStyles = [
    'w-full border bg-surface-field',
    'text-primary',
    'placeholder:text-faint',
    'focus:outline-none focus:ring-2 focus:ring-offset-0',
    'disabled:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-70',
    'transition-colors duration-normal',
  ].join(' ')

  const displayVariant = errorMessage ? 'error' : variant

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-secondary">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          baseStyles,
          variantStyles[displayVariant],
          sizeStyles[size],
          className
        )}
        aria-describedby={
          [errorMessage ? errorId : null, helperText ? helperId : null]
            .filter(Boolean)
            .join(' ') || undefined
        }
        aria-invalid={displayVariant === 'error'}
        {...props}
      />
      {/* Through FormError rather than its own paragraph: a labelled field and
          a bare field like the login pill have to fail in the same voice, and
          two copies of this markup drift the first time either is touched. */}
      {errorMessage && <FormError id={errorId}>{errorMessage}</FormError>}
      {helperText && !errorMessage && (
        <p id={helperId} className="text-sm text-muted">
          {helperText}
        </p>
      )}
    </div>
  )
}

export default Input
