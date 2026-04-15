import React from 'react'

export interface InputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'size'
> {
  variant?: 'default' | 'error'
  label?: string
  helperText?: string
  errorMessage?: string
  inputSize?: 'sm' | 'md' | 'lg'
}

const variantStyles: Record<NonNullable<InputProps['variant']>, string> = {
  default: [
    'border-[var(--color-neutral-300)]',
    'focus:border-[var(--color-primary-500)]',
    'focus:ring-[var(--color-primary-500)]',
  ].join(' '),
  error: [
    'border-[var(--color-error-500)]',
    'focus:border-[var(--color-error-500)]',
    'focus:ring-[var(--color-error-500)]',
  ].join(' '),
}

const sizeStyles: Record<NonNullable<InputProps['inputSize']>, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-[var(--radius-md)]',
  md: 'px-3 py-2 text-base rounded-[var(--radius-md)]',
  lg: 'px-4 py-3 text-lg rounded-[var(--radius-lg)]',
}

export function Input({
  variant = 'default',
  label,
  helperText,
  errorMessage,
  inputSize = 'md',
  id,
  className = '',
  ...props
}: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  const helperId = inputId ? `${inputId}-helper` : undefined
  const errorId = inputId ? `${inputId}-error` : undefined

  const baseStyles = [
    'w-full border bg-white',
    'text-[var(--color-neutral-900)]',
    'placeholder:text-[var(--color-neutral-400)]',
    'focus:outline-none focus:ring-2 focus:ring-offset-0',
    'disabled:bg-[var(--color-neutral-100)] disabled:cursor-not-allowed disabled:opacity-70',
    'transition-colors duration-[var(--duration-normal)]',
  ].join(' ')

  const displayVariant = errorMessage ? 'error' : variant

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-[var(--color-neutral-700)]"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={[
          baseStyles,
          variantStyles[displayVariant],
          sizeStyles[inputSize],
          className,
        ].join(' ')}
        aria-describedby={
          [errorMessage ? errorId : null, helperText ? helperId : null]
            .filter(Boolean)
            .join(' ') || undefined
        }
        aria-invalid={displayVariant === 'error'}
        {...props}
      />
      {errorMessage && (
        <p
          id={errorId}
          className="text-sm text-[var(--color-error-600)]"
          role="alert"
        >
          {errorMessage}
        </p>
      )}
      {helperText && !errorMessage && (
        <p id={helperId} className="text-sm text-[var(--color-neutral-500)]">
          {helperText}
        </p>
      )}
    </div>
  )
}

export default Input
