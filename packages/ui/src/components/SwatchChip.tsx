import React from 'react'
import { cn } from '../utils/cn'

export interface SwatchChipProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'color'
> {
  /** The swatch fill — any CSS color value. */
  color: string
  /** Accessible name for the color; also shown as a native tooltip. */
  label: string
  /** Whether the swatch is currently selected */
  selected?: boolean
  ref?: React.Ref<HTMLButtonElement>
}

/**
 * A selectable color swatch — a Chip whose meaning is carried by its fill
 * rather than a text label. Renders as a toggle button with `aria-pressed`;
 * the label is exposed to assistive tech and as a hover tooltip. A hairline
 * border keeps very light swatches visible on light surfaces.
 */
export function SwatchChip({
  color,
  label,
  selected = false,
  className,
  style,
  ref,
  ...props
}: SwatchChipProps) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      aria-label={label}
      title={label}
      className={cn(
        'h-7 w-10 shrink-0 rounded-chip',
        'border border-divider',
        'transition-shadow duration-normal',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus',
        selected && 'ring-2 ring-offset-2 ring-accent',
        className
      )}
      style={{ backgroundColor: color, ...style }}
      {...props}
    />
  )
}

export default SwatchChip
