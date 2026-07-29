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
 * Behind the auth gate like the rest of the app: it sits outside
 * /design-system because that layout clamps to 960px, and page width is part
 * of what this exists to show. Signed-in only, so it is not a public surface.
 */

import { useState } from 'react'
import { Panel, ToastProvider } from '@paradoxui/ui'
import { GardenPlantView } from '@/components/plant-detail/GardenPlantView'
import { DiaryDrawer } from '@/components/plant-detail/DiaryDrawer'
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
 * The shipped cap is --content-max (1200px), sized so a 14in MacBook Pro
 * shows the whole column with a 40px gutter each side. The alternatives stay
 * here only so the difference is visible on a wider display.
 */
type WidthMode = 'product' | 'narrow' | 'fill'

const WIDTHS: Record<
  WidthMode,
  { label: string; className: string; note: string }
> = {
  product: {
    label: 'Shipped (1200)',
    className: 'max-w-content',
    note: 'What every page uses. Fits a 14in MacBook Pro exactly: 1512 - 232 sidebar - 40 - 40.',
  },
  narrow: {
    label: 'Previous (1032)',
    className: 'max-w-[1032px]',
    note: 'What the dashboard used before the sweep, for comparison.',
  },
  fill: {
    label: 'Fill available',
    className: 'max-w-none',
    note: 'No cap. Care becomes a short line in a very wide box, and the rows strand their content left.',
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
  const [isDiaryOpen, setIsDiaryOpen] = useState(false)

  const notes = NOTES_BY_DENSITY[density]

  const chip = (active: boolean) =>
    `rounded-chip px-2 py-1 text-label transition-colors duration-fast ${
      active
        ? 'bg-accent text-on-accent'
        : 'bg-surface-control text-secondary hover:bg-surface-hover'
    }`

  return (
    // ToastProvider because the diary drawer's story components use useToast,
    // which the real page gets from the (app) layout.
    <ToastProvider>
      {/* Mimics the real app shell (sidebar offset + content-gutter) so the
          width the cards get here is the width they get in the product. */}
      <div className="min-h-screen bg-surface-page">
        <div className="px-4 pb-20 md:ml-sidebar-offset md:mr-content-gutter md:px-0 md:pb-0">
          <div className={`${WIDTHS[width].className} pb-16 pt-8 md:pt-12`}>
            <div className="mb-8 flex flex-col gap-item-gap rounded-md border border-divider-subtle bg-surface-subtle p-card-padding">
              <p className="text-label text-muted">
                Harness for the real component, with sample data. The live page
                is /plants?plant=&lt;id&gt; for a plant you are growing.
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

            {/* No title here: the view's own hero owns the name and the
                botanical line, same as on the real page. */}
            <div>
              <GardenPlantView
                plant={SAMPLE_PLANT}
                notes={notes}
                heroPhotos={HERO_PHOTOS}
                subtitle={SAMPLE_PLANT.scientific_name}
                todayIso={TODAY_ISO}
                onHeroPhotoClick={() => {}}
                onSeeAllNotes={() => setIsDiaryOpen(true)}
                reference={
                  // Shape-only stand-in: the real card is built in
                  // PlantDetailPage, which owns the reference drawer's state.
                  <Panel
                    title="Care reference"
                    className="min-h-[234px] justify-between lg:h-full lg:min-h-0"
                  >
                    <p className="max-w-[70%] text-body text-secondary">
                      Water, light, soil, pruning, the full year, and the
                      botanical details.
                    </p>
                    <span className="text-body-small text-secondary">
                      Open reference
                    </span>
                  </Panel>
                }
              />
            </div>
          </div>
        </div>

        {isDiaryOpen && (
          <DiaryDrawer
            plantId={SAMPLE_PLANT.id}
            plantName={SAMPLE_PLANT.common_name}
            notes={notes}
            paletteId={null}
            isGrowing
            onClose={() => setIsDiaryOpen(false)}
            onAddedBackToGarden={() => {}}
          />
        )}
      </div>
    </ToastProvider>
  )
}
