'use client'

/**
 * Harness for the garden-scoped plant view, so it can be looked at without a
 * session and with logging densities that are hard to produce on demand in
 * real data (a never-logged plant, a planted-then-silent one).
 *
 * It renders the REAL GardenPlantView that /plants?plant=<id> renders. The
 * only things this file owns are the sample rows and the two toggles. Nothing
 * about the design lives here, so there is nothing to keep in sync.
 *
 * Public via a temporary entry in isPublicPath — remove before merge.
 */

import { useState } from 'react'
import { GardenPlantView } from '@/components/plant-detail/GardenPlantView'
import { SAMPLE_PLANT, NOTES_RICH, NOTES_SPARSE, NOTES_NONE } from './sample'
import type { DiaryNote } from '@/types/diary'

type Density = 'rich' | 'sparse' | 'none'

const NOTES_BY_DENSITY: Record<Density, DiaryNote[]> = {
  rich: NOTES_RICH,
  sparse: NOTES_SPARSE,
  none: NOTES_NONE,
}

const DENSITY_LABELS: [Density, string][] = [
  ['rich', 'Logged often'],
  ['sparse', 'Planted, then nothing'],
  ['none', 'Never logged'],
]

/**
 * The open product question this preview surfaced: the dashboard caps content
 * at 1032px while the app shell hands it the viewport minus the sidebar and a
 * 48px right margin. On a wide display that leaves several hundred px unused.
 * Raising it is a decision about the dashboard too, so all three are shown
 * rather than one being picked quietly.
 */
type WidthMode = 'product' | 'wide' | 'fill'

const WIDTHS: Record<
  WidthMode,
  { label: string; className: string; note: string }
> = {
  product: {
    label: 'Product max (1032)',
    className: 'max-w-[1032px]',
    note: 'What the dashboard and the real plant page use today.',
  },
  wide: {
    label: 'Wider cap (1280)',
    className: 'max-w-[1280px]',
    note: 'Cards breathe and the grid keeps its proportions. Would need the dashboard raised to match.',
  },
  fill: {
    label: 'Fill available',
    className: 'max-w-none',
    note: 'No cap. Right now becomes a short line in a very wide box, and the 3-up row strands its content left.',
  },
}

/** Stand-ins for the species hero photos, so the photo row shows its layout. */
const HERO_PHOTOS = [
  '/placeholder-img.png',
  '/placeholder-img.png',
  '/placeholder-img.png',
]

/**
 * Module scope, not render: computed once when the bundle loads, so SSR and
 * hydration agree. The real page gets this from its server component.
 */
const TODAY_ISO = new Date().toISOString().slice(0, 10)

export default function PlantPreviewPage() {
  const [density, setDensity] = useState<Density>('rich')
  const [width, setWidth] = useState<WidthMode>('product')

  const notes = NOTES_BY_DENSITY[density]

  const chip = (active: boolean) =>
    `rounded-chip px-2 py-1 text-label transition-colors duration-fast ${
      active
        ? 'bg-accent text-on-accent'
        : 'bg-surface-control text-secondary hover:bg-surface-hover'
    }`

  return (
    // Mimics the real app shell (sidebar offset + mr-12) so the width the
    // cards get here is the width they get in the product.
    <div className="min-h-screen bg-surface-page">
      <div className="px-4 pb-20 md:ml-sidebar-offset md:mr-12 md:px-0 md:pb-0">
        <div className={`${WIDTHS[width].className} pb-16 pt-8 md:pt-12`}>
          <div className="mb-8 flex flex-col gap-item-gap rounded-md border border-divider-subtle bg-surface-subtle p-card-padding">
            <p className="text-label text-muted">
              Harness for the real component, with sample data. The live page is
              /plants?plant=&lt;id&gt; for a plant you are growing.
            </p>
            <div className="flex flex-wrap items-center gap-tight-gap">
              <span className="text-label text-secondary">
                How much is logged:
              </span>
              {DENSITY_LABELS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDensity(value)}
                  className={chip(density === value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-tight-gap">
              <span className="text-label text-secondary">Page width:</span>
              {(Object.keys(WIDTHS) as WidthMode[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setWidth(value)}
                  className={chip(width === value)}
                >
                  {WIDTHS[value].label}
                </button>
              ))}
            </div>
            <p className="text-label text-muted">{WIDTHS[width].note}</p>
          </div>

          <h1 className="text-title font-semibold text-primary">
            {SAMPLE_PLANT.common_name}
          </h1>
          <p className="mt-3 text-body italic text-secondary">
            {SAMPLE_PLANT.scientific_name}
          </p>

          <div className="mt-8">
            <GardenPlantView
              plant={SAMPLE_PLANT}
              notes={notes}
              heroPhotos={HERO_PHOTOS}
              todayIso={TODAY_ISO}
              onHeroPhotoClick={() => {}}
              onSeeAllNotes={() => {}}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
