'use client'

import { useEffect, useId, useRef, useState } from 'react'

export interface FilterDropdownOption {
  value: string
  label: string
  /** Optional colour swatch shown before the label (used by the Color axis). */
  swatch?: string
}

interface FilterDropdownProps {
  /** Axis name shown on the chip, e.g. "Type". */
  label: string
  options: FilterDropdownOption[]
  selected: string[]
  onToggle: (value: string) => void
}

const CHEVRON = (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
    className="shrink-0"
  >
    <path
      d="M4 6l4 4 4-4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const CHECK = (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M3.5 8.5l3 3 6-6.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/**
 * A filter axis rendered as a dropdown chip: the trigger is a chip (accent when
 * the axis has selections, with a count), and clicking it opens a popover of
 * multi-select options that stays open while toggling. Closes on outside click
 * or Escape. Mirrors the `Chip` primitive's resting/selected treatment.
 */
export function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const count = selected.length
  const active = count > 0

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={[
          'inline-flex h-8 items-center gap-1.5 rounded-chip border px-row-gap',
          'text-body-small whitespace-nowrap select-none',
          'transition-colors duration-normal',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
          active
            ? 'border-transparent bg-accent text-on-accent hover:bg-accent-hover'
            : 'border-card bg-transparent text-primary hover:bg-surface-hover',
        ].join(' ')}
      >
        {label}
        {active && (
          <span
            className={[
              'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1',
              'text-micro',
              'bg-accent-hover',
            ].join(' ')}
          >
            {count}
          </span>
        )}
        <span
          className={[
            'transition-transform duration-normal',
            open ? 'rotate-180' : '',
          ].join(' ')}
        >
          {CHEVRON}
        </span>
      </button>

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={label}
          className={[
            'absolute left-0 top-full z-50 mt-1 min-w-[12rem]',
            'rounded-md border border-card bg-surface-control p-1 shadow-soft backdrop-blur-md',
          ].join(' ')}
        >
          {options.map((o) => {
            const isSelected = selected.includes(o.value)
            return (
              <button
                key={o.value}
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                onClick={() => onToggle(o.value)}
                className={[
                  'flex h-9 w-full items-center gap-2 rounded-sm px-2 text-left',
                  'text-body-small text-primary',
                  'transition-colors duration-normal hover:bg-surface-row-hover',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
                ].join(' ')}
              >
                {o.swatch ? (
                  <span
                    aria-hidden="true"
                    className={[
                      'size-6 shrink-0 rounded-md border border-divider',
                      'transition-shadow duration-normal',
                      isSelected ? 'ring-2 ring-fern-500 ring-offset-2' : '',
                    ].join(' ')}
                    style={{ backgroundColor: o.swatch }}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className={[
                      'flex size-4 shrink-0 items-center justify-center rounded-[4px] border',
                      isSelected
                        ? 'border-transparent bg-accent text-on-accent'
                        : 'border-transparent bg-accent-muted',
                    ].join(' ')}
                  >
                    {isSelected && CHECK}
                  </span>
                )}
                {o.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default FilterDropdown
