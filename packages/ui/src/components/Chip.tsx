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
        'px-row-gap',
        'rounded-chip',
        'text-body-small',
        'whitespace-nowrap select-none',
        'transition-colors duration-normal',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        selected
          ? 'bg-surface-inverse text-inverse'
          : 'bg-surface-control text-primary hover:bg-gray-0',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </button>
  )
}

export default Chip
