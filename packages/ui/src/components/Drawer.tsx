'use client'

import React, { useEffect } from 'react'

export interface DrawerProps {
  /** Accessible name for the panel (rendered as aria-label). */
  label: string
  onClose: () => void
  /** aria-label for the close button. */
  closeLabel?: string
  /** Icon node for the close button — defaults to an inline X. */
  closeIcon?: React.ReactNode
  /** Right side of the header row — the drawer's own actions. */
  headerActions?: React.ReactNode
  /**
   * Element the panel renders as. Defaults to a plain `aside`. Pass an
   * animatable component (e.g. framer-motion's `motion.aside`) together
   * with `panelProps` to animate the drawer — the kit itself carries no
   * animation dependency.
   */
  panelComponent?: React.ElementType
  /** Extra props spread onto the panel — e.g. motion variants. */
  panelProps?: Record<string, unknown>
  /** Rendered below the header. Callers own their body layout and scroll. */
  children: React.ReactNode
}

const defaultCloseIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
      clipRule="evenodd"
    />
  </svg>
)

/**
 * Side-panel drawer chrome: fixed full-screen sheet below `lg`, a right-hand
 * panel at `lg` and up. Owns positioning, the body scroll lock, and the
 * header row (close button + actions). Animation is injected via
 * `panelComponent`/`panelProps`, never bundled.
 */
export function Drawer({
  label,
  onClose,
  closeLabel = 'Close',
  closeIcon = defaultCloseIcon,
  headerActions,
  panelComponent,
  panelProps,
  children,
}: DrawerProps) {
  useEffect(() => {
    // Mirrors the lg breakpoint: below it the drawer is a full-screen
    // sheet, so the page underneath must not scroll behind it.
    const mq = window.matchMedia('(max-width: 1023px)')
    if (!mq.matches) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [])

  const Panel = panelComponent ?? 'aside'

  return (
    <Panel
      aria-label={label}
      {...panelProps}
      className="fixed inset-0 z-20 flex w-full flex-col overflow-hidden bg-surface-card lg:inset-x-auto lg:top-2 lg:bottom-2 lg:right-0 lg:w-[440px] lg:rounded-l-lg lg:border-l lg:border-y lg:border-card"
    >
      <div className="flex w-full shrink-0 items-center justify-between border-b border-card p-card-padding">
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="flex size-8 items-center justify-center rounded-full border border-card bg-surface-control transition-opacity duration-normal hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {closeIcon}
        </button>
        {headerActions && (
          <div className="flex items-center gap-inline-gap">
            {headerActions}
          </div>
        )}
      </div>
      {children}
    </Panel>
  )
}

export default Drawer
