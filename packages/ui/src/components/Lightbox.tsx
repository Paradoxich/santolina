'use client'

import React from 'react'
import { cn } from '../utils/cn'

export interface LightboxImage {
  src: string
  alt: string
}

export interface LightboxProps {
  /** Ordered images to page through. */
  images: LightboxImage[]
  isOpen: boolean
  onClose: () => void
  /** Which image to show first when opened. Clamped to a valid index. */
  initialIndex?: number
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M13.3333 13.3333L2.66667 2.66667M13.3333 2.66667L2.66667 13.3333"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={direction === 'left' ? undefined : { transform: 'scaleX(-1)' }}
    >
      <path
        d="M10 3L5 8L10 13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Full-screen image viewer. Pages through `images` with prev/next controls
 * and the ArrowLeft/ArrowRight keys; Esc, the backdrop, and the close button
 * all dismiss it. Renders plain `<img>` (framework-agnostic) so callers keep
 * control of image sourcing. Wrap-around navigation; controls and counter
 * hide when there's a single image.
 */
export function Lightbox({
  images,
  isOpen,
  onClose,
  initialIndex = 0,
}: LightboxProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null)
  const [index, setIndex] = React.useState(initialIndex)
  const count = images.length

  // Re-seed the active index each time the viewer is opened.
  React.useEffect(() => {
    if (isOpen)
      setIndex(Math.min(Math.max(initialIndex, 0), Math.max(count - 1, 0)))
  }, [isOpen, initialIndex, count])

  // Drive the native <dialog> so we inherit its focus trap and Esc handling.
  React.useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (isOpen) {
      if (!dialog.open) dialog.showModal()
    } else if (dialog.open) {
      dialog.close()
    }
  }, [isOpen])

  React.useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handleClose = () => onClose()
    dialog.addEventListener('close', handleClose)
    return () => dialog.removeEventListener('close', handleClose)
  }, [onClose])

  const go = React.useCallback(
    (delta: number) => {
      if (count < 2) return
      setIndex((i) => (i + delta + count) % count)
    },
    [count]
  )

  if (!isOpen) return null
  const current = images[index]
  if (!current) return null

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      go(1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      go(-1)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onKeyDown={handleKeyDown}
      aria-label="Image viewer"
      className={cn(
        'm-0 h-full max-h-none w-full max-w-none',
        'bg-surface-inverse p-0 text-inverse',
        'backdrop:bg-scrim'
      )}
    >
      {/* Clicking the empty stage (not a child) dismisses. */}
      <div
        className="relative flex h-full w-full items-center justify-center p-card-padding sm:p-section-break"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <img
          src={current.src}
          alt={current.alt}
          className="max-h-full max-w-full rounded-lg object-contain"
        />

        <button
          type="button"
          onClick={onClose}
          aria-label="Close image viewer"
          className={cn(
            'absolute right-card-padding top-card-padding',
            'flex size-10 items-center justify-center rounded-full',
            'bg-fern-900 text-fern-100',
            'transition-colors duration-normal hover:bg-surface-hover',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
          )}
        >
          <CloseIcon />
        </button>

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous image"
              className={cn(
                'absolute left-card-padding top-1/2 -translate-y-1/2',
                'flex size-10 items-center justify-center rounded-full',
                'bg-fern-900 text-fern-100',
                'transition-colors duration-normal hover:bg-surface-hover',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
              )}
            >
              <ChevronIcon direction="left" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next image"
              className={cn(
                'absolute right-card-padding top-1/2 -translate-y-1/2',
                'flex size-10 items-center justify-center rounded-full',
                'bg-fern-900 text-fern-100',
                'transition-colors duration-normal hover:bg-surface-hover',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
              )}
            >
              <ChevronIcon direction="right" />
            </button>

            <div
              className={cn(
                'absolute bottom-card-padding left-1/2 -translate-x-1/2',
                'rounded-full bg-fern-900 px-item-gap py-tight-gap',
                'text-body-small text-fern-100'
              )}
              aria-live="polite"
            >
              {index + 1} / {count}
            </div>
          </>
        )}
      </div>
    </dialog>
  )
}

export default Lightbox
