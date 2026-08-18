import React, { useId } from 'react'
import { cn } from '../utils/cn'
import { FieldShell, type FieldSize } from './FieldShell'
import { FormError } from './FormError'

export interface InputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'size'
> {
  label?: string
  helperText?: string
  errorMessage?: string
  size?: FieldSize
  /** Rendered inside the field, before the input. */
  leading?: React.ReactNode
  /** Rendered inside the field, after the input — a submit, a unit, a clear. */
  trailing?: React.ReactNode
  /** Class applied to the field shell rather than the inner input. */
  className?: string
  ref?: React.Ref<HTMLInputElement>
}

/**
 * A single-line text field.
 *
 * The visual treatment lives in FieldShell, shared with Textarea, SearchField
 * and Select, so the four cannot drift. What belongs to Input specifically is
 * everything that makes the field usable rather than merely correct-looking:
 * the label association, the helper and error text, and the aria wiring
 * between them.
 *
 * `trailing` exists because the login field puts its submit button inside the
 * field. That was hand-rolled markup precisely because the kit had no slot for
 * it, which is how it ended up with a treatment of its own.
 */
export function Input({
  label,
  helperText,
  errorMessage,
  size = 'md',
  leading,
  trailing,
  id,
  className,
  disabled,
  ref,
  ...props
}: InputProps) {
  const reactId = useId()
  const inputId = id ?? `${reactId}-input`
  const helperId = `${reactId}-helper`
  const errorId = `${reactId}-error`

  const describedBy =
    [errorMessage ? errorId : null, helperText ? helperId : null]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <div className="flex flex-col gap-inline-gap">
      {label && (
        <label
          htmlFor={inputId}
          className="text-body-small font-medium text-secondary"
        >
          {label}
        </label>
      )}

      <FieldShell
        size={size}
        invalid={Boolean(errorMessage)}
        disabled={disabled}
        leading={leading}
        trailing={trailing}
        className={className}
      >
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          className={cn(
            'min-w-0 flex-1 bg-transparent text-body text-primary',
            'placeholder:text-muted',
            'outline-none disabled:cursor-not-allowed'
          )}
          aria-describedby={describedBy}
          aria-invalid={errorMessage ? true : undefined}
          {...props}
        />
      </FieldShell>

      {/* Through FormError rather than its own paragraph: a labelled field and
          a bare field like the login pill have to fail in the same voice, and
          two copies of this markup drift the first time either is touched. */}
      {errorMessage && <FormError id={errorId}>{errorMessage}</FormError>}
      {helperText && !errorMessage && (
        <p id={helperId} className="text-body-small text-muted">
          {helperText}
        </p>
      )}
    </div>
  )
}

export default Input
