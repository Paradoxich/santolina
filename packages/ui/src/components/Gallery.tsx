'use client'

import React from 'react'
import { cn } from '../utils/cn'

export interface GalleryImage {
  src: string
  alt: string
}

export interface GalleryProps {
  /** Ordered images to lay out in the collage. */
  images: GalleryImage[]
  isOpen: boolean
  onClose: () => void
  /** Which image to scroll into view when opened. Clamped to a valid index. */
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

type CollageItem = { image: GalleryImage; index: number }

type CollageRow =
  | { kind: 'full'; item: CollageItem }
  | { kind: 'pair'; items: [CollageItem, CollageItem] }

/**
 * Repeating rhythm: one landscape, then two portraits, then again.
 * A leftover single after a landscape becomes its own landscape row —
 * never an empty half of a pair.
 */
function buildCollageRows(images: GalleryImage[]): CollageRow[] {
  const rows: CollageRow[] = []
  let i = 0
  while (i < images.length) {
    const lead = images[i]!
    rows.push({ kind: 'full', item: { image: lead, index: i } })
    i += 1
    if (i >= images.length) break

    const a = images[i]
    const b = images[i + 1]
    if (a && b) {
      rows.push({
        kind: 'pair',
        items: [
          { image: a, index: i },
          { image: b, index: i + 1 },
        ],
      })
      i += 2
    } else if (a) {
      rows.push({ kind: 'full', item: { image: a, index: i } })
      i += 1
    }
  }
  return rows
}

/**
 * Full-screen scrollable image collage. Lays out `images` in a repeating
 * landscape → two-portrait rhythm so the viewer can scroll through every
 * photo without paging. Esc, the backdrop, and the close button dismiss it.
 * Renders plain `<img>` (framework-agnostic) so callers keep control of
 * image sourcing. On open, scrolls `initialIndex` into view.
 */
export function Gallery({
  images,
  isOpen,
  onClose,
  initialIndex = 0,
}: GalleryProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null)
  const tileRefs = React.useRef<Map<number, HTMLElement>>(new Map())
  const count = images.length
  const focusIndex = Math.min(Math.max(initialIndex, 0), Math.max(count - 1, 0))

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

  // After open, land on the tapped image so opening from photo N is useful.
  React.useEffect(() => {
    if (!isOpen || count === 0) return
    const frame = requestAnimationFrame(() => {
      tileRefs.current.get(focusIndex)?.scrollIntoView({
        block: 'center',
        behavior: 'auto',
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [isOpen, focusIndex, count])

  if (!isOpen) return null
  if (count === 0) return null

  const rows = buildCollageRows(images)

  const setTileRef = (index: number, el: HTMLElement | null) => {
    if (el) tileRefs.current.set(index, el)
    else tileRefs.current.delete(index)
  }

  const tile = (item: CollageItem, aspect: string) => (
    <div
      key={item.index}
      ref={(el) => setTileRef(item.index, el)}
      data-gallery-index={item.index}
      className={cn(
        'relative w-full overflow-hidden rounded-md bg-surface-inset',
        aspect
      )}
    >
      <img
        src={item.image.src}
        alt={item.image.alt}
        className="absolute inset-0 size-full object-cover"
      />
    </div>
  )

  return (
    <dialog
      ref={dialogRef}
      aria-label="Image gallery"
      className={cn(
        // Native <dialog> sizes to content by default — pin to the viewport
        // so short collages still cover the page underneath.
        'fixed inset-0 m-0 box-border min-h-dvh h-dvh max-h-dvh w-full max-w-none',
        'bg-surface-page p-0 text-primary',
        'backdrop:bg-scrim'
      )}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close image gallery"
        className={cn(
          'absolute right-card-padding top-card-padding z-10',
          'flex size-10 items-center justify-center rounded-full',
          'bg-surface-card text-primary',
          'transition-colors duration-normal hover:bg-surface-hover',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
        )}
      >
        <CloseIcon />
      </button>

      <div
        className="h-full min-h-0 w-full overflow-y-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <div className="mx-auto flex w-full max-w-[60rem] flex-col gap-item-gap px-card-padding pb-section-break pt-section-break">
          {rows.map((row, rowIndex) =>
            row.kind === 'full' ? (
              <div key={`row-${rowIndex}`}>
                {tile(row.item, 'aspect-[3/2]')}
              </div>
            ) : (
              <div
                key={`row-${rowIndex}`}
                className="grid grid-cols-2 gap-item-gap"
              >
                {tile(row.items[0], 'aspect-[3/4]')}
                {tile(row.items[1], 'aspect-[3/4]')}
              </div>
            )
          )}
        </div>
      </div>
    </dialog>
  )
}

export default Gallery
