'use client'

import React from 'react'

export interface TabItem {
  /** Unique value identifying the tab */
  value: string
  label: string
  /** Optional count rendered as a superscript next to the label */
  count?: number
}

export interface TabsProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'onChange'
> {
  items: TabItem[]
  /** Value of the active tab */
  value: string
  onChange?: (value: string) => void
}

/**
 * Underlined text tabs with optional superscript counts.
 * Keyboard navigation: arrow keys move focus, Enter/Space select.
 */
export function Tabs({
  items,
  value,
  onChange,
  className = '',
  ...props
}: TabsProps) {
  const tabRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map())

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex: number | null = null
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % items.length
    if (e.key === 'ArrowLeft')
      nextIndex = (index - 1 + items.length) % items.length
    const next = nextIndex !== null ? items[nextIndex] : undefined
    if (next) {
      e.preventDefault()
      tabRefs.current.get(next.value)?.focus()
      onChange?.(next.value)
    }
  }

  return (
    <div
      role="tablist"
      className={['flex items-start gap-section-gap', className]
        .join(' ')
        .trim()}
      {...props}
    >
      {items.map((item, index) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            ref={(el) => {
              if (el) tabRefs.current.set(item.value, el)
              else tabRefs.current.delete(item.value)
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange?.(item.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={[
              'relative inline-flex items-start gap-1 pb-3',
              'text-body',
              'whitespace-nowrap select-none',
              'transition-colors duration-normal',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              active
                ? 'font-semibold text-primary'
                : 'font-normal text-muted hover:text-primary',
              active
                ? 'after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:bg-current after:content-[""]'
                : '',
            ].join(' ')}
          >
            {item.label}
            {item.count !== undefined && (
              <sup className="mt-[3px] text-label font-normal text-muted">
                {item.count}
              </sup>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default Tabs
