import React from 'react'
import { cn } from '../utils/cn'

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Whether the chip is currently selected */
  selected?: boolean
  ref?: React.Ref<HTMLButtonElement>
  children: React.ReactNode
}

/**
 * A selectable filter pill. Renders as a toggle button with
 * `aria-pressed` reflecting the selected state.
 */
export function Chip({
  selected = false,
  children,
  className,
  ref,
  ...props
}: ChipProps) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      className={cn(
        'inline-flex h-8 items-center justify-center',
        'px-row-gap',
        'rounded-chip',
        'border',
        'text-body-small',
        'whitespace-nowrap select-none',
        'transition-colors duration-normal',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        selected
          ? 'border-transparent bg-accent text-on-accent hover:bg-accent-hover'
          : 'border-card bg-transparent text-primary hover:bg-surface-hover',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export default Chip
