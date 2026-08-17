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
import { BLOOM_COLOR_BUCKETS } from '@/lib/bloom-colors'

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
 * Hand-picked photo per colour bucket, chosen with the tint applied. Fixed
 * URLs on purpose: these are editorial picks for the tiles, decided
 * separately from any plant's hero image, so re-picking a hero in the
 * catalogue never changes a tile. Comments carry the plant the photo is of.
 */
const COLOR_HERO: Record<string, string> = {
  // Asian bleeding-heart
  white:
    'https://bs.plantnet.org/image/o/fe29eabfdd58dd98be18210d3ed4a89f91fb8286',
  // Lavender cotton (santolina, the namesake) — Ana's pick: frosted silver
  // foliage on a dark ground, reads unmistakably silver against the tint
  silver:
    'https://d2seqvvyy3b8p2.cloudfront.net/ea6d31a8af6019ef11632e876947fbf3.jpg',
  // Amur adonis (Ana's pick over a falling stars shot that cropped badly)
  yellow:
    'https://d2seqvvyy3b8p2.cloudfront.net/12ba5c2912abeb046e038ccfe89fd6be.jpg',
  // California poppy
  orange:
    'https://bs.plantnet.org/image/o/757ff42cbc2a89dff00169aea2e19eb07d00dc52',
  // Dahlia-flowered zinnia
  red: 'https://bs.plantnet.org/image/o/8d574fb571cfdd616d1af06c5db6f84735f71e37',
  // Korean angelica
  burgundy:
    'https://bs.plantnet.org/image/o/cfaf3a5c7a03af2fd40389aa2e5eaaae107f2bc0',
  // Camellia
  pink: 'https://bs.plantnet.org/image/o/ab337d3a85d41a1917d1a4434e2ed354df446e84',
  // Everlasting-pea
  magenta:
    'https://bs.plantnet.org/image/o/8876edab80e1649e97543a3b7a7f11b64ab15f9b',
  // Adria bellflower
  purple:
    'https://bs.plantnet.org/image/o/3c13a605622068993cd625eaadf5b92c6d1feb68',
  // Lavender
  lavender:
    'https://bs.plantnet.org/image/o/5a5ace80216cd8376fe03d0bc07ff3941918ed5e',
  // Great forget-me-not
  blue: 'https://bs.plantnet.org/image/o/9f3b3dd049bf523513ae0f44145cd43069ff8610',
  // Ivy (Hedera helix)
  green:
    'https://bs.plantnet.org/image/o/63e30359aa2bb71ae903d0aaadee660aabec8754',
}

/** Overlay that lifts white type off the photo. Matches the Figma gradient. */
const SCRIM =
  'pointer-events-none absolute inset-0 bg-[image:var(--photo-tile-scrim)]'

export function ExploreBrowse({
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
            const heroSrc = COLOR_HERO[bucket.value]
            return (
              <button
                key={bucket.value}
                type="button"
                onClick={() => onSelectColor(bucket.value)}
                className="group relative isolate flex aspect-[174/153] flex-col justify-end overflow-hidden rounded-md p-inline-gap text-left [clip-path:inset(0_round_var(--radius-md))]"
              >
                {/* Stack, bottom up: full-colour photo, bucket colour at 50%,
                    dark scrim for the label.

                    Normal blend, not multiply. Multiply can only darken, so
                    the pale buckets (white #f7f5ee, silver #a7b2bd) would
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
                  className="absolute inset-0 h-full w-full rounded-[inherit] transition-transform duration-slow group-hover:scale-[1.04]"
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
                className="group flex aspect-[271/365] flex-col gap-item-gap rounded-card-dashboard border border-card-translucent bg-surface-card p-card-padding text-left transition-colors duration-normal hover:bg-surface-hover"
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
