import React, { useId } from 'react'
import { cn } from '../utils/cn'
import { FieldShell } from './FieldShell'
import { FormError } from './FormError'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  helperText?: string
  errorMessage?: string
  /** Rendered inside the field, after the text — a photo button, a send. */
  trailing?: React.ReactNode
  /** Class applied to the field shell rather than the inner textarea. */
  className?: string
  ref?: React.Ref<HTMLTextAreaElement>
}

/**
 * A multi-line text field, sharing FieldShell with Input, SearchField and
 * Select. Separate from Input rather than an `Input multiline` flag because
 * the two elements take different attributes — `rows` and `wrap` mean nothing
 * to an input, `type` and `pattern` mean nothing to a textarea — and a single
 * component would accept all of them and honour half.
 */
export function Textarea({
  label,
  helperText,
  errorMessage,
  trailing,
  id,
  className,
  disabled,
  rows = 3,
  ref,
  ...props
}: TextareaProps) {
  const reactId = useId()
  const fieldId = id ?? `${reactId}-textarea`
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
          htmlFor={fieldId}
          className="text-body-small font-medium text-secondary"
        >
          {label}
        </label>
      )}

      <FieldShell
        multiline
        invalid={Boolean(errorMessage)}
        disabled={disabled}
        trailing={trailing}
        className={className}
      >
        <textarea
          ref={ref}
          id={fieldId}
          rows={rows}
          disabled={disabled}
          className={cn(
            'min-w-0 flex-1 resize-none bg-transparent text-body text-primary',
            'placeholder:text-muted',
            'outline-none disabled:cursor-not-allowed'
          )}
          aria-describedby={describedBy}
          aria-invalid={errorMessage ? true : undefined}
          {...props}
        />
      </FieldShell>

      {errorMessage && <FormError id={errorId}>{errorMessage}</FormError>}
      {helperText && !errorMessage && (
        <p id={helperId} className="text-body-small text-muted">
          {helperText}
        </p>
      )}
    </div>
  )
}

export default Textarea
