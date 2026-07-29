'use client'

import { useState } from 'react'
import { DemoConvertModal } from '@/components/DemoConvertModal'

// Shown in the app shell for a visitor who started a demo instead of signing
// up. It says plainly that this garden is temporary and opens the way to keep
// it; the keeping itself happens in DemoConvertModal, which is the /login card
// in a dialog.
//
// Copy is a draft awaiting Ana's voice pass.

export function DemoBanner() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Sticky rather than fixed: it keeps its own space in the flow, so
          nothing below needs a matching padding. min-h-11 is 2.75rem, the same
          value the layout gives --app-chrome-top — the bar must be exactly the
          sidebar's top inset or a hairline of page shows between them. z-20
          puts it over the sidebar's z-10. */}
      <div className="sticky top-0 z-20 flex min-h-11 flex-wrap items-center justify-center gap-item-gap border-b border-card-translucent bg-surface-card px-4 py-3 text-center text-body-small">
        <p className="text-secondary">You’re looking around a demo garden.</p>

        <button
          type="button"
          className="text-primary underline underline-offset-2"
          onClick={() => setOpen(true)}
        >
          Keep this garden
        </button>
      </div>

      <DemoConvertModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  )
}
