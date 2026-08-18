'use client'

import React, { useEffect, useId, useRef, useState } from 'react'
import { cn } from '../utils/cn'
import { FieldShell, type FieldSize } from './FieldShell'
import { FormError } from './FormError'

export interface SelectOption<T extends string = string> {
  value: T
  label: string
  disabled?: boolean
}

export interface SelectProps<T extends string = string> {
  options: SelectOption<T>[]
  value: T | null
  onChange: (value: T) => void
  /** Visible label above the field. Omit only if `aria-label` is supplied. */
  label?: string
  /** Accessible name when there is no visible label. */
  'aria-label'?: string
  /** Shown in place of a value when nothing is selected. */
  placeholder?: string
  helperText?: string
  errorMessage?: string
  size?: FieldSize
  disabled?: boolean
  className?: string
  /** Class applied to the popup — use to cap its height or widen it. */
  listClassName?: string
}

/**
 * A value picker: a field-shaped trigger that opens a `listbox`.
 *
 * This exists rather than a field-styled variant of Menu because the two are
 * different things and ARIA draws the line where the product does. A menu is a
 * list of ACTIONS; a select holds a VALUE, displays it, and announces it. The
 * note scope picker was a Menu, which meant `role="menu"` over a list of
 * choices, and — because Menu names its trigger with `aria-label` — a trigger
 * that announced "Choose what this note is about" and never once said which
 * plant was chosen. Both are fixed here by being the right component, not by
 * adding props to the wrong one.
 *
 * Keyboard follows the APG listbox pattern: Enter/Space/ArrowDown/ArrowUp open,
 * arrows move, Home/End jump, printable characters jump to a matching option,
 * Enter/Space commit, Escape closes without changing the value, Tab closes and
 * moves on. Focus moves to the options themselves (roving tabindex) rather than
 * `aria-activedescendant`, which keeps the browser's own scrolling behaviour.
 */
export function Select<T extends string = string>({
  options,
  value,
  onChange,
  label,
  'aria-label': ariaLabel,
  placeholder = 'Select…',
  helperText,
  errorMessage,
  size = 'md',
  disabled = false,
  className,
  listClassName,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false)
  const reactId = useId()
  const listId = `${reactId}-list`
  const labelId = `${reactId}-label`
  const valueId = `${reactId}-value`
  const helperId = `${reactId}-helper`
  const errorId = `${reactId}-error`

  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<(HTMLLIElement | null)[]>([])
  const typeahead = useRef({ buffer: '', at: 0 })

  const selectedIndex = options.findIndex((o) => o.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null
  const enabled = options
    .map((o, i) => (o.disabled ? -1 : i))
    .filter((i) => i >= 0)

  const focusOption = (index: number | undefined) => {
    if (index === undefined) return
    requestAnimationFrame(() => optionRefs.current[index]?.focus())
  }

  const openWith = (index: number | undefined) => {
    if (disabled) return
    setOpen(true)
    focusOption(index ?? (selectedIndex >= 0 ? selectedIndex : enabled[0]))
  }

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }

  const commit = (option: SelectOption<T>) => {
    if (option.disabled) return
    onChange(option.value)
    close()
  }

  // Outside click closes without refocusing the trigger — the pointer has
  // already moved the user's attention somewhere else.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [open])

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openWith(undefined)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      openWith(enabled[enabled.length - 1])
    }
  }

  const onListKeyDown = (e: React.KeyboardEvent, index: number) => {
    const pos = enabled.indexOf(index)
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        focusOption(enabled[(pos + 1) % enabled.length])
        break
      case 'ArrowUp':
        e.preventDefault()
        focusOption(enabled[(pos - 1 + enabled.length) % enabled.length])
        break
      case 'Home':
        e.preventDefault()
        focusOption(enabled[0])
        break
      case 'End':
        e.preventDefault()
        focusOption(enabled[enabled.length - 1])
        break
      case 'Escape':
        e.preventDefault()
        close()
        break
      case 'Tab':
        // Not prevented: Tab should close and continue to the next control
        // rather than trap, which is what separates a listbox from a dialog.
        setOpen(false)
        break
      case 'Enter':
      case ' ': {
        e.preventDefault()
        const option = options[index]
        if (option) commit(option)
        break
      }
      default: {
        if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return
        const now = Date.now()
        const t = typeahead.current
        t.buffer = now - t.at > 700 ? e.key : t.buffer + e.key
        t.at = now
        const match = enabled.find((i) =>
          options[i]?.label.toLowerCase().startsWith(t.buffer.toLowerCase())
        )
        if (match !== undefined) {
          e.preventDefault()
          focusOption(match)
        }
      }
    }
  }

  const describedBy =
    [errorMessage ? errorId : null, helperText ? helperId : null]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <div className={cn('flex flex-col gap-inline-gap', className)}>
      {/* The name source is always an element, never `aria-label`, so the
          trigger's name can be composed as "<name> <value>". Given only
          `aria-label`, that text goes into a hidden span rather than onto the
          button — an aria-label on the trigger REPLACES its name and would
          silence the value, which is the exact defect this component exists to
          fix, and it survived the first round of tests because they only
          covered the visible-label path. */}
      {label ? (
        <span
          id={labelId}
          className="text-body-small font-medium text-secondary"
        >
          {label}
        </span>
      ) : (
        ariaLabel && (
          <span id={labelId} className="sr-only">
            {ariaLabel}
          </span>
        )
      )}

      <div ref={containerRef} className="relative">
        {/* The trigger's accessible name is the label AND the current value,
            in that order, so it announces "Note scope, Your garden" rather
            than hiding the value behind an aria-label. */}
        <FieldShell
          as="button"
          size={size}
          invalid={Boolean(errorMessage)}
          disabled={disabled}
          ref={triggerRef}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-labelledby={`${labelId} ${valueId}`}
          aria-describedby={describedBy}
          aria-invalid={errorMessage ? true : undefined}
          onClick={() => (open ? close() : openWith(undefined))}
          onKeyDown={onTriggerKeyDown}
          trailing={<Chevron open={open} />}
        >
          <span
            id={valueId}
            className={cn(
              'min-w-0 flex-1 truncate text-body',
              selected ? 'text-primary' : 'text-muted'
            )}
          >
            {selected ? selected.label : placeholder}
          </span>
        </FieldShell>

        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-labelledby={labelId}
            className={cn(
              'absolute left-0 right-0 top-[calc(100%+var(--space-tight-gap))] z-20',
              'flex flex-col rounded-md border border-card bg-sage-100 p-1 shadow-soft',
              listClassName
            )}
          >
            {options.map((option, i) => {
              const isSelected = option.value === value
              return (
                <li
                  key={option.value}
                  ref={(el) => {
                    optionRefs.current[i] = el
                  }}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled || undefined}
                  tabIndex={-1}
                  onClick={() => commit(option)}
                  onKeyDown={(e) => onListKeyDown(e, i)}
                  className={cn(
                    'cursor-pointer rounded-sm px-item-gap py-inline-gap text-body',
                    'outline-none transition-colors duration-normal',
                    option.disabled
                      ? 'cursor-not-allowed text-faint'
                      : 'text-primary hover:bg-surface-card focus:bg-surface-card',
                    isSelected && 'font-medium'
                  )}
                >
                  {option.label}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {errorMessage && <FormError id={errorId}>{errorMessage}</FormError>}
      {helperText && !errorMessage && (
        <p id={helperId} className="text-body-small text-muted">
          {helperText}
        </p>
      )}
    </div>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={cn(
        'shrink-0 text-secondary transition-transform duration-normal',
        open && 'rotate-180'
      )}
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
}

export default Select
