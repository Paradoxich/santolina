'use client'

/**
 * The Plant library's browse view: three ways in, shown when nothing is
 * searched or filtered. Style cards, colour tiles, condition cards. Clicking
 * any tile applies the matching filter and hands over to the results list.
 *
 * Replaced the horizontal collection shelves (July 2026, v3 design).
 */

import { DitheredImage } from '@paradoxui/ui'
import { PlantImage } from '@/components/PlantImage'
import { BLOOM_COLOR_BUCKETS, bucketsForPlant } from '@/lib/bloom-colors'
import type { CatalogPlant } from '@/types/garden'

/**
 * WebGL cannot texture a cross-origin image without CORS headers, and
 * bs.plantnet.org sends none — the shader would silently fall back to the
 * plain <img>. Routing through Next's optimiser makes the bytes same-origin,
 * so the texture loads. Local files (the style and condition cards) need no
 * such treatment.
 */
function sameOrigin(src: string | undefined): string {
  if (!src) return ''
  if (src.startsWith('/')) return src
  return `/_next/image?url=${encodeURIComponent(src)}&w=640&q=75`
}

interface ExploreBrowseProps {
  plants: CatalogPlant[]
  onSelectStyle: (style: string) => void
  onSelectColor: (bucket: string) => void
  onSelectSun: (sun: string) => void
}

/**
 * Copy still wants a voice pass. Dash-free per the UI copy rules.
 * `image` is spelled out rather than derived from `value` — two of the files
 * are shortened (mediterran, wild), so a template would silently 404.
 */
const STYLES: {
  value: string
  label: string
  blurb: string
  image: string
}[] = [
  {
    value: 'mediterranean',
    label: 'Mediterranean',
    blurb: 'Silver foliage, gravel and heat. Plants that shrug off drought.',
    image: '/collections/style-mediterran.webp',
  },
  {
    value: 'wildflower',
    label: 'Wildflower',
    blurb:
      'Loose and seasonal, full of pollinators. Meadow feeling in a small space.',
    image: '/collections/style-wild.webp',
  },
  {
    value: 'cottage',
    label: 'Cottage',
    blurb:
      'Soft, abundant and a little unruly. Roses, spires and self seeders.',
    image: '/collections/style-cottage.webp',
  },
  {
    value: 'lush',
    label: 'Lush',
    blurb: 'Big leaves and deep green. Shade, moisture and texture.',
    image: '/collections/style-lush.webp',
  },
  {
    value: 'modern',
    label: 'Modern',
    blurb: 'Restrained shapes and repetition. Grasses, structure and calm.',
    image: '/collections/style-modern.webp',
  },
  {
    value: 'classic',
    label: 'Classic',
    blurb:
      'Clipped forms and quiet symmetry. Evergreen bones, seasonal colour.',
    image: '/collections/style-classic.webp',
  },
]

/** `image` spelled out for the same reason as STYLES — the filenames are shortened. */
const CONDITIONS: { value: string; label: string; image: string }[] = [
  {
    value: 'full_sun',
    label: 'For sunny areas',
    image: '/collections/cond-sun.webp',
  },
  {
    value: 'shade',
    label: 'Thrive in shade',
    image: '/collections/cond-shade.webp',
  },
  {
    value: 'partial_sun',
    label: 'Loves the semi shade',
    image: '/collections/cond-semishade.webp',
  },
]

/**
 * Hand-picked photo per colour bucket, chosen with the tint applied. Plant ids rather than names
 * because names are not unique in the catalogue; comments carry the name so a
 * reader does not have to look ids up.
 *
 * `image` overrides which photo of that plant to use. Without it the tile takes
 * the plant's default (`image_url`, i.e. the first of `image_urls`). Lavender
 * needs the override because the shot Ana wanted is the third in the array.
 */
const COLOR_HERO: Record<string, { plant: string; image?: string }> = {
  white: { plant: '2ba33cdb-11c7-41d0-9f69-3c3d671548e4' }, // Asian bleeding-heart
  cream: { plant: 'aa20f336-813d-49d0-b057-8c6ea8f2f7bf' }, // Primrose
  yellow: { plant: 'e4570de1-14da-4d19-9e98-a6af343881f3' }, // Common sneezeweed
  orange: { plant: '3614be73-e555-4641-bc8e-46402240b850' }, // Calendula
  red: { plant: '4b599dbe-f860-449f-9fa5-e7e838a4a077' }, // Dahlia-flowered zinnia
  burgundy: { plant: '1302f404-4913-4cb9-a9c6-944f42e06eda' }, // Hollyhock
  pink: { plant: 'f0fcab50-b94f-4915-adfe-6a4a47bde5c4' }, // Astrantia
  magenta: { plant: '63e7315f-2a38-4c32-b3bb-bc68fc0d8276' }, // Everlasting-pea
  purple: { plant: '7c176431-b727-4e3c-b324-a3eb622d24bd' }, // Adria bellflower
  lavender: {
    plant: '0e369364-220d-440a-9797-50907aab5949', // Lavender
    image:
      'https://bs.plantnet.org/image/o/5a5ace80216cd8376fe03d0bc07ff3941918ed5e',
  },
  blue: { plant: '38c7c233-c4f4-40a3-acf2-71e993cb0bcc' }, // Blue eryngo
  green: { plant: 'e7a6ad2e-938a-46a8-9bd0-39e4b6a79400' }, // Ivy (Hedera helix)
}

/** First plant in the set with a usable photo — deterministic, so tiles don't shuffle on re-render. */
function pickImage(pool: CatalogPlant[]): CatalogPlant | undefined {
  return pool.find((p) => p.imageUrl) ?? pool[0]
}

/** Overlay that lifts white type off the photo. Matches the Figma gradient. */
const SCRIM =
  'pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(17,20,17,0.8)] to-[rgba(17,20,17,0)] to-70%'

export function ExploreBrowse({
  plants,
  onSelectStyle,
  onSelectColor,
  onSelectSun,
}: ExploreBrowseProps) {
  return (
    <div className="flex flex-col gap-16">
      {/* ---------- Styles ---------- */}
      <section className="flex flex-col gap-section-gap">
        <h2 className="text-stat font-semibold tracking-heading text-primary">
          Find your garden style
        </h2>

        <div className="grid grid-cols-1 gap-item-gap sm:grid-cols-2 lg:grid-cols-3">
          {STYLES.map((style) => {
            return (
              <button
                key={style.value}
                type="button"
                onClick={() => onSelectStyle(style.value)}
                className="group relative flex aspect-[369/462] flex-col justify-end overflow-hidden rounded-card-tile p-card-padding text-left"
              >
                <PlantImage
                  src={style.image}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 369px, (min-width: 640px) 50vw, 100vw"
                  className="object-cover transition-transform duration-slow group-hover:scale-[1.03]"
                />
                <span className={SCRIM} aria-hidden="true" />
                <span className="relative text-subheading font-semibold tracking-heading text-inverse">
                  {style.label}
                </span>
                <span className="relative mt-tight-gap text-body text-inverse">
                  {style.blurb}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ---------- Colours ---------- */}
      <section className="flex flex-col gap-section-gap">
        <h2 className="text-subheading font-semibold tracking-heading text-primary">
          Explore by color
        </h2>

        <div className="grid grid-cols-3 gap-item-gap sm:grid-cols-4 lg:grid-cols-6">
          {BLOOM_COLOR_BUCKETS.map((bucket) => {
            const pool = plants.filter((p) =>
              bucketsForPlant(p.bloomColor).includes(bucket.value)
            )
            // Hand-picked photo: the explicit override if there is one, else
            // the chosen plant's default, else the first photo in the bucket
            // if that plant ever leaves the catalogue.
            const choice = COLOR_HERO[bucket.value]
            const heroPlant =
              plants.find((p) => p.id === choice?.plant) ?? pickImage(pool)
            const heroSrc = choice?.image ?? heroPlant?.imageUrl
            return (
              <button
                key={bucket.value}
                type="button"
                onClick={() => onSelectColor(bucket.value)}
                className="group relative flex aspect-[174/153] flex-col justify-end overflow-hidden rounded-md p-inline-gap text-left"
              >
                {/* Stack, bottom up: full-colour photo, bucket colour at 50%,
                    dark scrim for the label.

                    Normal blend, not multiply. Multiply can only darken, so
                    the two pale buckets (white #f7f5ee, cream #f0e3b8) would
                    leave the photo untouched. 50% is the point where the
                    photograph still carries the composition and every bucket
                    still reads as itself; higher flattens the tiles into
                    swatches. The photo keeps its natural colour: each hero is
                    hand-picked to already sit in its bucket's hue, so the
                    tint reinforces rather than fights it. */}
                <DitheredImage
                  src={sameOrigin(heroSrc)}
                  levels={14}
                  cell={2}
                  revealRadius={0}
                  motion={false}
                  className="absolute inset-0 h-full w-full transition-transform duration-slow group-hover:scale-[1.04]"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 opacity-50"
                  style={{ backgroundColor: bucket.swatch }}
                />
                <span className={SCRIM} aria-hidden="true" />
                <span className="relative text-body font-medium text-inverse">
                  {bucket.label}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ---------- Conditions ---------- */}
      <section className="flex flex-col gap-section-gap lg:flex-row lg:items-center lg:gap-card-padding">
        <div className="flex flex-col gap-tight-gap lg:w-[271px] lg:shrink-0">
          <h2 className="text-title font-semibold leading-none tracking-title text-primary">
            Different conditions
          </h2>
          <p className="text-body leading-normal text-secondary">
            Match plants to the light your garden actually gets.
          </p>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-item-gap sm:grid-cols-3">
          {CONDITIONS.map((condition) => {
            return (
              <button
                key={condition.value}
                type="button"
                onClick={() => onSelectSun(condition.value)}
                className="group flex aspect-[271/365] flex-col gap-item-gap rounded-card-dashboard border border-card-translucent bg-[rgba(255,255,255,0.2)] p-card-padding text-left transition-colors duration-normal hover:bg-surface-hover"
              >
                <div className="relative min-h-0 flex-1 overflow-hidden rounded-md">
                  <PlantImage
                    src={condition.image}
                    alt=""
                    fill
                    sizes="(min-width: 640px) 271px, 100vw"
                    className="object-cover transition-transform duration-slow group-hover:scale-[1.06]"
                  />
                </div>
                <span className="shrink-0 text-heading font-semibold text-primary">
                  {condition.label}
                </span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

export default ExploreBrowse
