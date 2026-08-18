import React from 'react'
import { cn } from '../utils/cn'
import { FieldShell, type FieldSize } from './FieldShell'

export interface SearchFieldProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size'
> {
  /** Accessible label for the input. Defaults to the placeholder. */
  label?: string
  size?: FieldSize
  /** Class applied to the field shell. */
  className?: string
  /** Class applied to the leading magnifier icon. Defaults to `text-secondary`. */
  iconClassName?: string
  /** Class applied to the inner `<input>` — text size, placeholder colour. */
  inputClassName?: string
  /**
   * Optional slot rendered at the trailing edge — typically a clear button.
   * Interactive elements are safe here: clicking them does not activate the
   * label's input focus.
   */
  trailingAction?: React.ReactNode
  ref?: React.Ref<HTMLInputElement>
}

/**
 * A search input: the shared field shell with a leading magnifier.
 *
 * Separate from Input because the behaviour is separate — it filters as you
 * type, it clears, it never submits a value anyone saves, and it takes no
 * label, helper or error text. It looks identical because it shares
 * FieldShell, not because anyone keeps it in step.
 *
 * It was a translucent pill with a soft shadow until 2026-08-18. The shadow
 * was the only one on any field in the product, and `shadow-soft` everywhere
 * else means something floating above the page — a menu, a popover, a sticky
 * header. A field is an inset, so it read as the wrong thing; and the pill had
 * already been overridden away at its busiest call site.
 */
export function SearchField({
  label,
  placeholder = 'Search...',
  size = 'md',
  className,
  iconClassName,
  inputClassName,
  trailingAction,
  disabled,
  ref,
  ...props
}: SearchFieldProps) {
  return (
    <FieldShell
      as="label"
      size={size}
      disabled={disabled}
      className={cn('cursor-text', className)}
      leading={<Magnifier className={iconClassName} />}
      trailing={
        trailingAction && <span className="shrink-0">{trailingAction}</span>
      }
    >
      <input
        ref={ref}
        type="search"
        aria-label={label ?? placeholder}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'w-full min-w-0 flex-1 bg-transparent',
          'text-body text-primary',
          'placeholder:text-muted',
          'outline-none disabled:cursor-not-allowed',
          '[&::-webkit-search-cancel-button]:hidden',
          inputClassName
        )}
        {...props}
      />
    </FieldShell>
  )
}

function Magnifier({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={cn('shrink-0 text-secondary', className)}
    >
      <path
        d="M14 14L11.0093 11.004M12.6667 7C12.6667 8.50289 12.0696 9.94423 11.0069 11.0069C9.94423 12.0696 8.50289 12.6667 7 12.6667C5.49711 12.6667 4.05577 12.0696 2.99306 11.0069C1.93036 9.94423 1.33333 8.50289 1.33333 7C1.33333 5.49711 1.93036 4.05577 2.99306 2.99306C4.05577 1.93036 5.49711 1.33333 7 1.33333C8.50289 1.33333 9.94423 1.93036 11.0069 2.99306C12.0696 4.05577 12.6667 5.49711 12.6667 7Z"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default SearchField
