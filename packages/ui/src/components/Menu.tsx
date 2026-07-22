'use client'

import React, { useEffect, useId, useRef, useState } from 'react'
import { cn } from '../utils/cn'

export interface MenuItem {
  label: string
  onSelect: () => void
  /** `critical` renders the destructive treatment. */
  tone?: 'default' | 'critical'
  disabled?: boolean
  icon?: React.ReactNode
}

export interface MenuProps {
  /** Menu items in display order. */
  items: MenuItem[]
  /** Accessible name for the trigger button. */
  label: string
  /** Content rendered inside the trigger button (e.g. a chevron icon). */
  trigger: React.ReactNode
  /** Where the panel opens relative to the trigger. */
  position?: 'bottom' | 'top'
  /** Which trigger edge the panel lines up with. */
  align?: 'start' | 'end'
  /** Class applied to the trigger button. */
  triggerClassName?: string
  /** Class applied to the wrapper — use to stretch the trigger. */
  className?: string
  /** Class applied to the panel — use to widen it past the 8rem minimum. */
  menuClassName?: string
}

/**
 * A small dropdown action menu — a trigger button that opens a `role="menu"`
 * panel. Keyboard: Enter/Space/ArrowDown open and focus the first item;
 * arrows cycle; Home/End jump; Escape closes and returns focus to the
 * trigger. Closes on outside click and on selection.
 */
export function Menu({
  items,
  label,
  trigger,
  position = 'bottom',
  align = 'end',
  triggerClassName,
  className,
  menuClassName,
}: MenuProps) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const containerRef = useRef<HTMLSpanElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const enabledIndexes = items
    .map((item, i) => (item.disabled ? -1 : i))
    .filter((i) => i >= 0)

  const focusItem = (index: number | undefined) => {
    if (index === undefined) return
    itemRefs.current[index]?.focus()
  }

  const openAndFocusFirst = () => {
    setOpen(true)
    // Items mount on the next paint — focus after they exist.
    requestAnimationFrame(() => {
      if (enabledIndexes.length > 0) focusItem(enabledIndexes[0])
    })
  }

  const close = (returnFocus = true) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const current = itemRefs.current.findIndex(
      (el) => el === document.activeElement
    )
    const pos = enabledIndexes.indexOf(current)
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusItem(enabledIndexes[(pos + 1) % enabledIndexes.length])
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusItem(
        enabledIndexes[
          (pos - 1 + enabledIndexes.length) % enabledIndexes.length
        ]
      )
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusItem(enabledIndexes[0])
    } else if (e.key === 'End') {
      e.preventDefault()
      focusItem(enabledIndexes[enabledIndexes.length - 1])
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      openAndFocusFirst()
    }
  }

  return (
    <span ref={containerRef} className={cn('relative inline-flex', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => (open ? close() : openAndFocusFirst())}
        onKeyDown={onTriggerKeyDown}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className={cn(
            'absolute z-50 min-w-[8rem]',
            align === 'end' ? 'right-0' : 'left-0',
            position === 'bottom' ? 'top-full mt-1' : 'bottom-full mb-1',
            'rounded-md border border-card bg-surface-control p-1 shadow-soft backdrop-blur-md',
            menuClassName
          )}
        >
          {items.map((item, i) => (
            <button
              key={item.label}
              ref={(el) => {
                itemRefs.current[i] = el
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled}
              onClick={() => {
                close()
                item.onSelect()
              }}
              className={cn(
                'flex h-10 w-full items-center gap-inline-gap rounded-sm px-inline-gap text-left text-body-small',
                'transition-colors duration-normal',
                'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
                'disabled:cursor-not-allowed disabled:opacity-50',
                item.tone === 'critical'
                  ? 'text-critical hover:bg-surface-critical'
                  : 'text-primary hover:bg-surface-row-hover'
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}

export default Menu
