import React from 'react'
import { cn } from '../utils/cn'

export interface SearchFieldProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  /** Accessible label for the input. Defaults to the placeholder. */
  label?: string
  /** Class applied to the outer pill wrapper. */
  className?: string
  /**
   * Optional slot rendered at the trailing edge of the pill — typically an
   * icon button (e.g. a filter toggle). Interactive elements are safe here:
   * clicking them does not activate the label's input focus.
   */
  trailingAction?: React.ReactNode
  /** Forwarded to the underlying search `<input>`. */
  ref?: React.Ref<HTMLInputElement>
}

/**
 * A pill-shaped search input with a leading magnifier icon and an optional
 * trailing action slot.
 */
export function SearchField({
  label,
  placeholder = 'Search...',
  className,
  trailingAction,
  ref,
  ...props
}: SearchFieldProps) {
  return (
    <label
      className={cn(
        'flex h-12 w-full items-center gap-item-gap',
        'rounded-full',
        'bg-surface-field',
        'px-section-gap',
        'shadow-soft',
        'transition-colors duration-normal',
        'focus-within:bg-gray-0',
        className
      )}
    >
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        className="shrink-0 text-secondary"
      >
        <path
          d="M14 14L11.0093 11.004M12.6667 7C12.6667 8.50289 12.0696 9.94423 11.0069 11.0069C9.94423 12.0696 8.50289 12.6667 7 12.6667C5.49711 12.6667 4.05577 12.0696 2.99306 11.0069C1.93036 9.94423 1.33333 8.50289 1.33333 7C1.33333 5.49711 1.93036 4.05577 2.99306 2.99306C4.05577 1.93036 5.49711 1.33333 7 1.33333C8.50289 1.33333 9.94423 1.93036 11.0069 2.99306C12.0696 4.05577 12.6667 5.49711 12.6667 7Z"
          stroke="currentColor"
          strokeWidth="1.33333"
          strokeLinecap="round"
        />
      </svg>
      <input
        ref={ref}
        type="search"
        aria-label={label ?? placeholder}
        placeholder={placeholder}
        className={cn(
          'w-full min-w-0 flex-1 bg-transparent',
          'text-body-small text-primary',
          'placeholder:text-secondary',
          'outline-none',
          '[&::-webkit-search-cancel-button]:hidden'
        )}
        {...props}
      />
      {trailingAction && <span className="shrink-0">{trailingAction}</span>}
    </label>
  )
}

export default SearchField
