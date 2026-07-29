'use client'

/**
 * The growing-plant hero photo, inside a dashboard Panel so it matches the
 * Diary/Care cards below. One frame only — the full set opens in the Gallery
 * overlay on click. Empty plants keep a blank frame so the hero column
 * doesn't collapse beside the text.
 */

import { Icon, Panel } from '@paradoxui/ui'
import { icons } from '@/lib/icons'
import { PlantImage } from '@/components/PlantImage'

interface PlantGalleryProps {
  photos: string[]
  plantName: string
  onPhotoClick: (index: number) => void
}

const FRAME =
  'relative aspect-[3/2] w-full overflow-hidden rounded-sm bg-surface-inset transition-opacity duration-normal hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

function CountBadge({ count }: { count: number }) {
  return (
    <span
      className="pointer-events-none absolute bottom-item-gap right-item-gap flex items-center gap-tight-gap rounded-full bg-surface-overlay px-inline-gap py-tight-gap text-label text-primary"
      aria-hidden="true"
    >
      <Icon src={icons.image} size={14} />
      {count}
    </span>
  )
}

export function PlantGallery({
  photos,
  plantName,
  onPhotoClick,
}: PlantGalleryProps) {
  if (photos.length === 0) {
    return (
      <Panel className="w-full">
        <div className={FRAME}>
          <PlantImage
            src={null}
            alt={plantName}
            fill
            sizes="520px"
            className="object-cover"
          />
        </div>
      </Panel>
    )
  }

  const lead = photos[0]!
  const count = photos.length

  return (
    <Panel className="w-full">
      <button
        type="button"
        onClick={() => onPhotoClick(0)}
        aria-label={`View ${count} ${plantName} photos`}
        className={`${FRAME} cursor-pointer`}
      >
        <PlantImage
          src={lead}
          alt={`${plantName} photo 1`}
          fill
          sizes="520px"
          className="object-cover"
        />
        <CountBadge count={count} />
      </button>
    </Panel>
  )
}

export default PlantGallery
