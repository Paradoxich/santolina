import React from 'react'

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Whether the chip is currently selected */
  selected?: boolean
  children: React.ReactNode
}

/**
 * A selectable filter pill. Renders as a toggle button with
 * `aria-pressed` reflecting the selected state.
 */
export function Chip({
  selected = false,
  children,
  className = '',
  ...props
}: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={[
        'inline-flex h-8 items-center justify-center',
        'px-[var(--space-row-gap)]',
        'rounded-[var(--component-chip-radius)]',
        'text-[length:var(--font-size-body-small)]',
        'whitespace-nowrap select-none',
        'transition-colors duration-[var(--duration-normal)]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-primary)]',
        selected
          ? 'bg-[var(--color-text-primary)] text-[var(--text-button-primary-label)]'
          : 'bg-[var(--color-background-subtle)] text-[var(--text-chip-label)] hover:bg-white',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </button>
  )
}

export default Chip
