'use client'

/**
 * Internal tool for choosing the photo behind each colour tile in
 * `ExploreBrowse`. Every candidate renders exactly as the real tile renders it
 * (greyscale, bucket colour at 50%, scrim), so the choice is made on how the
 * photo will actually look rather than on the raw image. Click a candidate to
 * pick it; the summary at the top collects the choices as a paste-ready block
 * to drop into `COLOR_HERO`.
 *
 * Not linked from the nav — reachable only at /photo-picker.
 */

import { useState } from 'react'
import { PlantImage } from '@/components/PlantImage'
import { BLOOM_COLOR_BUCKETS, bucketsForPlant } from '@/lib/bloom-colors'
import type { CatalogPlant } from '@/types/garden'

/** Candidates shown per bucket. White has 200; a wall of them helps nobody. */
const PER_BUCKET = 24

export function ExplorePhotoPicker({ plants }: { plants: CatalogPlant[] }) {
  const [picks, setPicks] = useState<Record<string, CatalogPlant>>({})

  const summary = BLOOM_COLOR_BUCKETS.map((b) => {
    const p = picks[b.value]
    return `${b.value.padEnd(10)} ${p ? `${p.commonName}  (${p.id})` : '—'}`
  }).join('\n')

  const chosen = Object.keys(picks).length

  return (
    <div className="flex flex-col gap-12 pb-16 pt-8">
      <header className="flex flex-col gap-item-gap">
        <h1 className="text-title font-semibold tracking-title text-primary">
          Pick colour tile photos
        </h1>
        <p className="max-w-[60ch] text-body text-secondary">
          Every candidate below is shown with its tint already applied, so what
          you see is what the tile becomes. Click one per colour. Showing up to{' '}
          {PER_BUCKET} per bucket, alphabetical.
        </p>
      </header>

      {/* Running summary */}
      <div className="sticky top-0 z-10 flex flex-col gap-inline-gap rounded-card-tile border border-card bg-surface-card p-card-padding shadow-soft">
        <div className="flex items-baseline justify-between gap-row-gap">
          <span className="text-heading font-semibold text-primary">
            Picked {chosen} of {BLOOM_COLOR_BUCKETS.length}
          </span>
          {chosen > 0 && (
            <button
              type="button"
              onClick={() => setPicks({})}
              className="text-body-small text-muted underline"
            >
              Clear
            </button>
          )}
        </div>
        <pre className="overflow-x-auto whitespace-pre rounded-sm bg-surface-inset p-item-gap text-body-small text-primary">
          {summary}
        </pre>
      </div>

      {BLOOM_COLOR_BUCKETS.map((bucket) => {
        const pool = plants
          .filter((p) => bucketsForPlant(p.bloomColor).includes(bucket.value))
          .filter((p) => p.imageUrl)
          .slice(0, PER_BUCKET)

        const picked = picks[bucket.value]

        return (
          <section key={bucket.value} className="flex flex-col gap-item-gap">
            <div className="flex items-baseline gap-item-gap">
              <span
                aria-hidden="true"
                className="size-4 shrink-0 rounded-xs border border-divider"
                style={{ backgroundColor: bucket.swatch }}
              />
              <h2 className="text-subheading font-semibold tracking-heading text-primary">
                {bucket.label}
              </h2>
              <span className="text-body-small text-muted">
                {pool.length} shown
              </span>
              {picked && (
                <span className="text-body-small text-positive">
                  picked: {picked.commonName}
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-item-gap sm:grid-cols-4 lg:grid-cols-6">
              {pool.map((plant) => {
                const isPicked = picked?.id === plant.id
                return (
                  <button
                    key={plant.id}
                    type="button"
                    onClick={() =>
                      setPicks((prev) => ({ ...prev, [bucket.value]: plant }))
                    }
                    className={[
                      'relative flex aspect-[174/153] flex-col justify-end overflow-hidden rounded-md p-inline-gap text-left',
                      isPicked
                        ? 'outline outline-2 outline-offset-2 outline-focus'
                        : '',
                    ].join(' ')}
                  >
                    <PlantImage
                      src={plant.imageUrl}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 174px, 33vw"
                      className="object-cover grayscale"
                    />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 opacity-50"
                      style={{ backgroundColor: bucket.swatch }}
                    />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(17,20,17,0.8)] to-[rgba(17,20,17,0)] to-70%"
                    />
                    <span className="relative line-clamp-2 text-body-small font-medium text-inverse">
                      {plant.commonName}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export default ExplorePhotoPicker
